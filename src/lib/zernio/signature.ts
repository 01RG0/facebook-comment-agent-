import { createHmac } from 'crypto'
import { hmacEqual } from '@/lib/crypto'

export function verifyZernioSignature(
  rawBody: Buffer,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false

  const secret = process.env.ZERNIO_WEBHOOK_SECRET
  if (!secret) throw new Error('ZERNIO_WEBHOOK_SECRET is not configured')

  const expected = createHmac('sha256', secret).update(rawBody).digest()
  const hex = signatureHeader.trim().replace(/^sha256=/i, '')
  const received = Buffer.from(hex, 'hex')

  return hmacEqual(expected, received)
}
