import { Worker, type Job } from 'bullmq'
import { getAdminClient } from '@/lib/supabase/admin'
import { createAiProvider } from '@/lib/ai/factory'
import { sendPrivateReply } from '@/lib/facebook/graph'
import { decrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import type { CommentJobPayload } from '@/types/meta'
import { getRedisConnection } from './client'
import type { AiProviderName } from '@/lib/ai/types'

export function createCommentWorker() {
  return new Worker<CommentJobPayload>(
    'comment-replies',
    async (job: Job<CommentJobPayload>) => {
      const { pageId, fbPageId, commentId, postId, from, message, createdTime } = job.data
      const log = logger.child({ jobId: job.id, commentId, pageId })
      const db = getAdminClient()

      // ── 1. Check idempotency (DB-level dedup) ──────────────────────────────
      const { data: existing } = await db
        .from('comments_log')
        .select('id, status')
        .eq('fb_comment_id', commentId)
        .maybeSingle()

      if (existing && existing.status !== 'pending') {
        log.info('Comment already processed, skipping')
        return
      }

      // ── 2. Load page + settings ────────────────────────────────────────────
      const { data: page, error: pageErr } = await db
        .from('pages')
        .select('id, user_id, fb_page_id, access_token_enc, access_token_iv, agent_enabled')
        .eq('id', pageId)
        .single()

      if (pageErr || !page) throw new Error(`Page not found: ${pageId}`)

      if (!page.agent_enabled) {
        log.info('Agent disabled for page, skipping')
        await upsertLog(db, { commentId, pageId, userId: page.user_id, postId, from, message, status: 'skipped', skipReason: 'agent_disabled' })
        return
      }

      const { data: settings } = await db
        .from('settings')
        .select('*')
        .eq('page_id', pageId)
        .maybeSingle()

      const cfg = settings ?? defaultSettings(pageId, page.user_id)

      // ── 3. Blacklist check ─────────────────────────────────────────────────
      if (cfg.blacklisted_user_ids?.includes(from.id)) {
        log.info({ userId: from.id }, 'Commenter is blacklisted')
        await upsertLog(db, { commentId, pageId, userId: page.user_id, postId, from, message, status: 'skipped', skipReason: 'blacklisted' })
        return
      }

      // ── 4. Keyword filter ──────────────────────────────────────────────────
      if (cfg.keyword_filter && cfg.keyword_filter.length > 0) {
        const text = message.toLowerCase()
        const match = (cfg.keyword_filter as string[]).some((kw: string) => text.includes(kw.toLowerCase()))
        if (!match) {
          log.info('Comment does not match keyword filter')
          await upsertLog(db, { commentId, pageId, userId: page.user_id, postId, from, message, status: 'skipped', skipReason: 'keyword_filter' })
          return
        }
      }

      // ── 5. Admin usage limit check ─────────────────────────────────────────
      const { data: limits } = await db
        .from('usage_limits')
        .select('*')
        .eq('user_id', page.user_id)
        .maybeSingle()

      if (limits?.is_suspended) {
        log.warn({ userId: page.user_id }, 'User account suspended')
        await upsertLog(db, { commentId, pageId, userId: page.user_id, postId, from, message, status: 'skipped', skipReason: 'account_suspended' })
        return
      }

      if (limits?.max_requests_per_day || limits?.max_tokens_per_day) {
        const today = new Date().toISOString().split('T')[0]
        const { data: dayBucket } = await db
          .from('usage_daily_buckets')
          .select('request_count, token_count')
          .eq('user_id', page.user_id)
          .eq('bucket_day', today)
          .maybeSingle()

        if (limits.max_requests_per_day && (dayBucket?.request_count ?? 0) >= limits.max_requests_per_day) {
          log.warn({ userId: page.user_id }, 'Daily request limit reached')
          await upsertLog(db, { commentId, pageId, userId: page.user_id, postId, from, message, status: 'skipped', skipReason: 'daily_limit' })
          return
        }
        if (limits.max_tokens_per_day && (dayBucket?.token_count ?? 0) >= limits.max_tokens_per_day) {
          log.warn({ userId: page.user_id }, 'Daily token limit reached')
          await upsertLog(db, { commentId, pageId, userId: page.user_id, postId, from, message, status: 'skipped', skipReason: 'daily_token_limit' })
          return
        }
      }

      // ── 6. Per-page rate limit check ───────────────────────────────────────
      const bucketHour = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString()
      const { data: bucket } = await db
        .from('rate_limit_buckets')
        .select('reply_count')
        .eq('page_id', pageId)
        .eq('bucket_hour', bucketHour)
        .maybeSingle()

      const currentCount = bucket?.reply_count ?? 0
      if (currentCount >= cfg.max_replies_per_hour) {
        log.warn({ currentCount, limit: cfg.max_replies_per_hour }, 'Rate limit reached')
        await upsertLog(db, { commentId, pageId, userId: page.user_id, postId, from, message, status: 'skipped', skipReason: 'rate_limit' })
        return
      }

      // ── 7. Reply delay ─────────────────────────────────────────────────────
      if (cfg.reply_delay_seconds > 0) {
        const jobAge = (Date.now() - job.timestamp) / 1000
        if (jobAge < cfg.reply_delay_seconds) {
          const waitMs = (cfg.reply_delay_seconds - jobAge) * 1000
          log.info({ waitMs }, 'Reply delay — re-queuing with delay')
          throw Object.assign(new Error('reply_delay'), { delayMs: waitMs })
        }
      }

      // ── 8. Resolve custom provider if needed ───────────────────────────────
      let providerConfig = {
        provider: (cfg.ai_provider as AiProviderName) ?? 'gemini',
        model: cfg.ai_model ?? undefined,
        baseUrl: undefined as string | undefined,
      }

      // Check if it's a custom provider registered in DB
      const builtins = ['gemini', 'mistral', 'openai', 'openai-compat']
      if (!builtins.includes(cfg.ai_provider)) {
        const { data: customProvider } = await db
          .from('custom_ai_providers')
          .select('provider_type, base_url, default_model, api_key_enc, api_key_iv')
          .eq('name', cfg.ai_provider)
          .eq('is_enabled', true)
          .single()

        if (customProvider) {
          providerConfig = {
            provider: customProvider.provider_type as AiProviderName,
            model: cfg.ai_model ?? customProvider.default_model ?? undefined,
            baseUrl: customProvider.base_url ?? undefined,
          }
          // Use provider's system key if user has no personal key
          if (!cfg.ai_api_key_enc && customProvider.api_key_enc && customProvider.api_key_iv) {
            cfg.ai_api_key_enc = customProvider.api_key_enc
            cfg.ai_api_key_iv = customProvider.api_key_iv
          }
        }
      }

      // ── 9. Generate AI reply ───────────────────────────────────────────────
      const aiProvider = createAiProvider(
        providerConfig,
        cfg.ai_api_key_enc && cfg.ai_api_key_iv
          ? { enc: cfg.ai_api_key_enc, iv: cfg.ai_api_key_iv }
          : undefined
      )

      let aiResult: Awaited<ReturnType<typeof aiProvider.generateReply>> | null = null
      let commentLogId: string | null = null
      const t0 = Date.now()

      try {
        aiResult = await aiProvider.generateReply(message, cfg.reply_instructions, cfg.reply_language)
        log.info({ provider: aiProvider.providerName, tokens: aiResult.tokens?.totalTokens }, 'AI reply generated')
      } catch (aiErr) {
        const errMsg = (aiErr as Error).message
        log.error({ err: errMsg }, 'AI generation failed')
        // Log the failed AI request
        await insertAiUsageLog(db, {
          userId: page.user_id, pageId, commentLogId: null,
          provider: aiProvider.providerName, model: aiProvider.modelName,
          success: false, errorMessage: errMsg, latencyMs: Date.now() - t0,
        })
        await upsertLog(db, { commentId, pageId, userId: page.user_id, postId, from, message, status: 'failed', errorMessage: errMsg })
        throw aiErr
      }

      // ── 10. Send private reply ─────────────────────────────────────────────
      const pageToken = decrypt(page.access_token_enc, page.access_token_iv)
      await sendPrivateReply(commentId, aiResult.text, pageToken)
      log.info('Private reply sent')

      // ── 11. Increment rate-limit + usage buckets ───────────────────────────
      await db.rpc('increment_rate_bucket', { p_page_id: pageId, p_bucket_hour: bucketHour })
      await db.rpc('increment_usage_bucket', {
        p_user_id: page.user_id,
        p_bucket_day: new Date().toISOString().split('T')[0],
        p_requests: 1,
        p_tokens: aiResult.tokens?.totalTokens ?? 0,
      })

      // ── 12. Log success to comments_log ───────────────────────────────────
      const { data: logRow } = await upsertLog(db, {
        commentId, pageId, userId: page.user_id, postId, from, message,
        status: 'replied',
        replyText: aiResult.text,
        aiProvider: aiProvider.providerName,
        aiModel: aiProvider.modelName,
        repliedAt: new Date().toISOString(),
      })
      commentLogId = logRow?.id ?? null

      // ── 13. Append AI usage log ────────────────────────────────────────────
      await insertAiUsageLog(db, {
        userId: page.user_id, pageId, commentLogId,
        provider: aiProvider.providerName, model: aiProvider.modelName,
        promptTokens: aiResult.tokens?.promptTokens,
        completionTokens: aiResult.tokens?.completionTokens,
        totalTokens: aiResult.tokens?.totalTokens,
        latencyMs: aiResult.latencyMs ?? (Date.now() - t0),
        success: true,
      })
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
    }
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

type LogArgs = {
  commentId: string
  pageId: string
  userId: string
  postId: string
  from: { id: string; name: string }
  message: string
  status: 'replied' | 'skipped' | 'failed' | 'pending' | 'manual'
  replyText?: string
  skipReason?: string
  aiProvider?: string
  aiModel?: string
  errorMessage?: string
  repliedAt?: string
}

async function upsertLog(db: ReturnType<typeof getAdminClient>, args: LogArgs) {
  return db.from('comments_log').upsert({
    fb_comment_id: args.commentId,
    page_id: args.pageId,
    user_id: args.userId,
    fb_post_id: args.postId,
    commenter_id: args.from.id,
    commenter_name: args.from.name,
    comment_text: args.message,
    reply_text: args.replyText ?? null,
    status: args.status,
    skip_reason: args.skipReason ?? null,
    ai_provider: args.aiProvider ?? null,
    ai_model: args.aiModel ?? null,
    error_message: args.errorMessage ?? null,
    replied_at: args.repliedAt ?? null,
  }, { onConflict: 'fb_comment_id' }).select('id').single()
}

type AiLogArgs = {
  userId: string
  pageId: string
  commentLogId: string | null
  provider: string
  model: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  latencyMs?: number
  success: boolean
  errorMessage?: string
}

async function insertAiUsageLog(db: ReturnType<typeof getAdminClient>, args: AiLogArgs) {
  await db.from('ai_usage_logs').insert({
    user_id: args.userId,
    page_id: args.pageId,
    comment_log_id: args.commentLogId,
    provider: args.provider,
    model: args.model,
    prompt_tokens: args.promptTokens ?? null,
    completion_tokens: args.completionTokens ?? null,
    total_tokens: args.totalTokens ?? null,
    latency_ms: args.latencyMs ?? null,
    success: args.success,
    error_message: args.errorMessage ?? null,
  })
}

function defaultSettings(pageId: string, userId: string) {
  return {
    page_id: pageId,
    user_id: userId,
    ai_provider: 'gemini',
    ai_model: null,
    ai_api_key_enc: null,
    ai_api_key_iv: null,
    reply_instructions: 'You are a helpful assistant for this Facebook page. Reply warmly, concisely, and helpfully to comments.',
    reply_language: 'auto',
    reply_delay_seconds: 0,
    max_replies_per_hour: 100,
    keyword_filter: null,
    blacklisted_user_ids: null,
    reply_to_own_posts_only: false,
  }
}
