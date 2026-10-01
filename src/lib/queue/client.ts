// Redis/BullMQ removed — processing happens inline in the webhook handler.
// This file is kept as a stub so existing imports don't break.

export function getRedisConnection(): never {
  throw new Error('Redis is not configured — queue is disabled')
}

export function getCommentQueue(): never {
  throw new Error('Queue is disabled — comments are processed inline')
}
