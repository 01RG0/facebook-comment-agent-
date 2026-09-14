import 'dotenv/config'
import { createCommentWorker } from '@/lib/queue/comment-worker'
import { dmWorker } from '@/lib/queue/dm-worker'
import { getCommentQueue } from '@/lib/queue/client'
import { logger } from '@/lib/logger'

const worker = createCommentWorker()
const queue = getCommentQueue()

// Token refresh removed -- Zernio manages OAuth tokens

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

dmWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'DM job completed')
})

dmWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'DM job failed')
})

dmWorker.on('error', (err) => {
  logger.error({ err: err.message }, 'DM worker error')
})

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — closing workers')
  await worker.close()
  await dmWorker.close()
  await queue.close()
  process.exit(0)
})

logger.info('Comment reply worker started')
logger.info('DM reply worker started')

