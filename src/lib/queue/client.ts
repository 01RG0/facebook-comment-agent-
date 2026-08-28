import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import type { CommentJobPayload } from '@/types/meta'

let _connection: IORedis | null = null

export function getRedisConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  }
  return _connection
}

let _queue: Queue<CommentJobPayload> | null = null

export function getCommentQueue(): Queue<CommentJobPayload> {
  if (!_queue) {
    _queue = new Queue<CommentJobPayload>('comment-replies', {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000, age: 86400 },
        removeOnFail: { count: 500, age: 7 * 86400 },
      },
    })
  }
  return _queue
}
