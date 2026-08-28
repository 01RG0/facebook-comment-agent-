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

      // ── 5. Rate limit check ────────────────────────────────────────────────
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

      // ── 6. Reply delay ─────────────────────────────────────────────────────
      if (cfg.reply_delay_seconds > 0) {
        const jobAge = (Date.now() - job.timestamp) / 1000
        if (jobAge < cfg.reply_delay_seconds) {
          const waitMs = (cfg.reply_delay_seconds - jobAge) * 1000
          log.info({ waitMs }, 'Reply delay — re-queuing with delay')
          throw Object.assign(
            new Error('reply_delay'),
            { delayMs: waitMs }
          )
        }
      }

      // ── 7. Generate AI reply ───────────────────────────────────────────────
      const aiProvider = createAiProvider(
        {
          provider: (cfg.ai_provider as AiProviderName) ?? 'gemini',
          model: cfg.ai_model ?? undefined,
        },
        cfg.ai_api_key_enc && cfg.ai_api_key_iv
          ? { enc: cfg.ai_api_key_enc, iv: cfg.ai_api_key_iv }
          : undefined
      )

      const replyText = await aiProvider.generateReply(
        message,
        cfg.reply_instructions,
        cfg.reply_language
      )
      log.info({ provider: aiProvider.providerName }, 'AI reply generated')

      // ── 8. Send private reply ──────────────────────────────────────────────
      const pageToken = decrypt(page.access_token_enc, page.access_token_iv)
      await sendPrivateReply(commentId, replyText, pageToken)
      log.info('Private reply sent')

      // ── 9. Increment rate-limit bucket ────────────────────────────────────
      await db.rpc('increment_rate_bucket', { p_page_id: pageId, p_bucket_hour: bucketHour })

      // ── 10. Log success ────────────────────────────────────────────────────
      await upsertLog(db, {
        commentId, pageId, userId: page.user_id, postId, from, message,
        status: 'replied',
        replyText,
        aiProvider: aiProvider.providerName,
        aiModel: aiProvider.modelName,
        repliedAt: new Date().toISOString(),
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
  await db.from('comments_log').upsert({
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
  }, { onConflict: 'fb_comment_id' })
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
