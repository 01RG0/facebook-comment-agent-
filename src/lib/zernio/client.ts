import { logger } from '@/lib/logger'

const ZERNIO_BASE = 'https://zernio.com/api/v1'

async function zernioFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = process.env.ZERNIO_API_KEY
  if (!apiKey) {
    throw new Error('ZERNIO_API_KEY is not configured')
  }

  const url = `${ZERNIO_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${apiKey}`)
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    logger.error(
      { status: response.status, path, errorText },
      'Zernio API request failed'
    )
    throw new Error(`Zernio API error (${response.status}): ${errorText}`)
  }

  return response
}

export async function getConnectUrl(
  profileId: string,
  redirectUrl: string
): Promise<{ authUrl: string }> {
  const params = new URLSearchParams({
    profileId,
    redirect_url: redirectUrl,
  })
  const res = await zernioFetch(`/connect/facebook?${params.toString()}`, {
    method: 'GET',
  })
  return res.json()
}

export async function disconnectAccount(accountId: string): Promise<void> {
  await zernioFetch(`/accounts/${accountId}`, {
    method: 'DELETE',
  })
}

export async function sendZernioPrivateReply(
  platformPostId: string,
  commentId: string,
  accountId: string,
  message: string
): Promise<{ messageId: string }> {
  const res = await zernioFetch(
    `/inbox/comments/${encodeURIComponent(platformPostId)}/${encodeURIComponent(commentId)}/private-reply`,
    {
      method: 'POST',
      body: JSON.stringify({
        accountId,
        message,
      }),
    }
  )
  return res.json()
}

export async function sendZernioPublicReply(
  platformPostId: string,
  commentId: string,
  accountId: string,
  message: string
): Promise<void> {
  await zernioFetch(`/inbox/comments/${encodeURIComponent(platformPostId)}`, {
    method: 'POST',
    body: JSON.stringify({
      accountId,
      message,
      commentId,
    }),
  })
}

export async function createZernioWebhook(
  webhookUrl: string,
  secret: string
): Promise<{ id: string }> {
  const res = await zernioFetch('/webhooks/settings', {
    method: 'POST',
    body: JSON.stringify({
      name: 'comment-agent',
      url: webhookUrl,
      secret,
      events: ['comment.received'],
      isActive: true,
    }),
  })
  const data = await res.json()
  return { id: data.webhook?._id ?? data.id ?? '' }
}
