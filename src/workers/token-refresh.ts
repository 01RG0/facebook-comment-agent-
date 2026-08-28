import { Queue, Worker } from 'bullmq'
import { getAdminClient } from '@/lib/supabase/admin'
import { getRedisConnection } from '@/lib/queue/client'
import { refreshLongLivedToken } from '@/lib/facebook/graph'
import { decrypt, encrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'

const REFRESH_QUEUE = 'token-refresh'
// Refresh tokens every 50 days (long-lived tokens expire at 60 days)
const REFRESH_INTERVAL_MS = 50 * 24 * 60 * 60 * 1000

export function scheduleTokenRefresh() {
  const queue = new Queue(REFRESH_QUEUE, { connection: getRedisConnection() })

  // Schedule recurring refresh check every 24 hours
  queue.add('refresh-all-tokens', {}, {
    repeat: { every: 24 * 60 * 60 * 1000 },
    jobId: 'daily-token-refresh',
  })

  const worker = new Worker(
    REFRESH_QUEUE,
    async () => {
      const db = getAdminClient()
      const cutoff = new Date(Date.now() - REFRESH_INTERVAL_MS).toISOString()

      const { data: pages, error } = await db
        .from('pages')
        .select('id, fb_page_id, access_token_enc, access_token_iv, updated_at')
        .lt('updated_at', cutoff)

      if (error) {
        logger.error({ err: error.message }, 'Token refresh: failed to load pages')
        return
      }

      logger.info({ count: pages?.length ?? 0 }, 'Token refresh: checking pages')

      for (const page of pages ?? []) {
        try {
          const currentToken = decrypt(page.access_token_enc, page.access_token_iv)
          const refreshed = await refreshLongLivedToken(page.fb_page_id, currentToken)
          const { enc, iv } = encrypt(refreshed.access_token)

          await db
            .from('pages')
            .update({ access_token_enc: enc, access_token_iv: iv })
            .eq('id', page.id)

          logger.info({ pageId: page.id }, 'Token refreshed')
        } catch (err) {
          logger.error({ pageId: page.id, err: (err as Error).message }, 'Token refresh failed')
        }
      }
    },
    { connection: getRedisConnection() }
  )

  worker.on('error', (err) => logger.error({ err: err.message }, 'Token refresh worker error'))
}
