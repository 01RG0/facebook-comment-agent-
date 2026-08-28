import { createHmac } from 'crypto'
import { hmacEqual } from '@/lib/crypto'

export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false

  const [algo, digest] = signatureHeader.split('=')
  if (algo !== 'sha256' || !digest) return false

  const secret = process.env.META_APP_SECRET
  if (!secret) throw new Error('META_APP_SECRET is not configured')

  const expected = createHmac('sha256', secret).update(rawBody).digest()
  const received = Buffer.from(digest, 'hex')

  return hmacEqual(expected, received)
}
