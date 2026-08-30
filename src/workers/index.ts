import 'dotenv/config'
import { createCommentWorker } from '@/lib/queue/comment-worker'
import { getCommentQueue } from '@/lib/queue/client'
import { logger } from '@/lib/logger'

const worker = createCommentWorker()
const queue = getCommentQueue()

// ── Token refresh job (Phase 8) ───────────────────────────────────────────
import { scheduleTokenRefresh } from './token-refresh'
scheduleTokenRefresh()

// ── Health & queue monitor (runs on import via setInterval) ───────────────
import '@/monitor/index'

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Comment job completed')
})

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Comment job failed')
})

worker.on('error', (err) => {
  logger.error({ err: err.message }, 'Worker error')
})

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — closing worker')
  await worker.close()
  await queue.close()
  process.exit(0)
})

logger.info('Comment reply worker started')
