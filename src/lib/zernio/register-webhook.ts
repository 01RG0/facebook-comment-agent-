import 'dotenv/config'
import { createZernioWebhook } from './client'
import { logger } from '@/lib/logger'

async function main() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is not set')
  }

  const webhookSecret = process.env.ZERNIO_WEBHOOK_SECRET
  if (!webhookSecret) {
    throw new Error('ZERNIO_WEBHOOK_SECRET is not set')
  }

  const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/webhook/zernio`

  logger.info({ webhookUrl }, 'Registering webhook with Zernio...')

  try {
    const res = await createZernioWebhook(webhookUrl, webhookSecret)
    logger.info({ subscriptionId: res.id }, 'Successfully registered Zernio webhook')
    console.log(`Zernio webhook registered successfully! Subscription ID: ${res.id}`)
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to register Zernio webhook')
    process.exit(1)
  }
}

main()
