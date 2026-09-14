import { Worker, type Job } from 'bullmq'
import { getAdminClient } from '@/lib/supabase/admin'
import { createAiProvider } from '@/lib/ai/factory'
import { sendZernioDirectMessage } from '@/lib/zernio/client'
import { validateExternalUrl } from '@/lib/utils'
import { decrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import { getRedisConnection } from './client'
import type { AiProviderName } from '@/lib/ai/types'

interface DmJobPayload {
  threadId: string
  pageId: string
  senderId: string
  senderName: string
  message: string
}

export function createDmWorker() {
  const worker = new Worker<DmJobPayload>(
    'process-dm',
    async (job: Job<DmJobPayload>) => {
      const { threadId, pageId, senderId, senderName, message } = job.data
      const log = logger.child({ jobId: job.id, threadId, pageId })
      log.info('DM job picked up by worker')

      const db = getAdminClient()

      try {
        // ── 1. Load page ──────────────────────────────────────────────────────
        const { data: page, error: pageErr } = await db
          .from('pages')
          .select('id, user_id, fb_page_id, zernio_account_id, agent_enabled')
          .eq('id', pageId)
          .single()

        if (pageErr || !page) { log.warn({ pageId }, 'Page not found, skipping DM'); return }
        if (!page.agent_enabled) { log.info('Agent disabled, skipping DM'); return }

        // ── 2. Load settings ──────────────────────────────────────────────────
        const { data: settings } = await db
          .from('settings')
          .select('ai_provider, ai_model, custom_base_url, ai_api_key_enc, ai_api_key_iv, preferred_ai_key_ids, reply_instructions, reply_language, review_mode_enabled')
          .eq('page_id', pageId)
          .maybeSingle()

        // ── 3. Review mode → handoff ──────────────────────────────────────────
        if (settings?.review_mode_enabled) {
          await db.from('handoff_queue').insert({
            page_id: pageId,
            user_id: page.user_id,
            fb_comment_id: `dm-${threadId}-${Date.now()}`,
            fb_post_id: threadId,
            commenter_id: senderId,
            commenter_name: senderName,
            comment_text: message,
            status: 'pending',
          })
          log.info('Review mode: DM routed to handoff queue')
          return
        }

        // ── 4. Resolve AI key ─────────────────────────────────────────────────
        let apiKey: string | undefined
        let providerName = (settings?.ai_provider ?? 'gemini') as AiProviderName
        let modelName = settings?.ai_model ?? undefined
        let baseUrl = settings?.custom_base_url ?? undefined

        const preferredKeyIds: string[] = settings?.preferred_ai_key_ids ?? []
        if (preferredKeyIds.length > 0) {
          const { data: keyRow } = await db
            .from('ai_provider_keys')
            .select('provider, model, base_url, api_key_enc, api_key_iv')
            .eq('id', preferredKeyIds[0])
            .eq('user_id', page.user_id)
            .eq('is_active', true)
            .single()

          if (keyRow?.api_key_enc && keyRow?.api_key_iv) {
            apiKey = decrypt(keyRow.api_key_enc, keyRow.api_key_iv)
            providerName = keyRow.provider as AiProviderName
            modelName = keyRow.model ?? modelName
            baseUrl = keyRow.base_url ?? baseUrl
          }
        } else if (settings?.ai_api_key_enc && settings?.ai_api_key_iv) {
          apiKey = decrypt(settings.ai_api_key_enc, settings.ai_api_key_iv)
        }

        // ── 5. Generate AI reply ──────────────────────────────────────────────
        if (baseUrl) { try { validateExternalUrl(baseUrl) } catch { baseUrl = undefined } }
        const instructions = settings?.reply_instructions ?? 'You are a helpful assistant. Reply professionally and concisely.'
        const provider = createAiProvider({ provider: providerName, apiKey, model: modelName, baseUrl })
        const aiResult = await provider.generateReply(message, instructions, settings?.reply_language ?? 'auto')
        const aiReply = aiResult.text

        // ── 6. Send via Zernio ────────────────────────────────────────────────
        await sendZernioDirectMessage(page.zernio_account_id ?? '', senderId, aiReply)
        log.info({ senderId }, 'DM reply sent via Zernio')

        // ── 7. Store outbound message ─────────────────────────────────────────
        await db.from('messenger_messages').insert({
          thread_id: threadId,
          direction: 'outbound',
          text: aiReply,
          sent_by_label: 'ai',
          sent_at: new Date().toISOString(),
        })

        // ── 8. Update thread ──────────────────────────────────────────────────
        await db.from('messenger_threads').update({
          last_message_at: new Date().toISOString(),
          unread_count: 0,
        }).eq('id', threadId)

      } catch (err) {
        log.error({ err }, 'DM worker error — not rethrowing to avoid BullMQ retry loop')
      }
    },
    { connection: getRedisConnection() }
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'DM job failed')
  })

  return worker
}

export const dmWorker = createDmWorker()
