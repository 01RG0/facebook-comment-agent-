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
    method: 'PUT',
    body: JSON.stringify({ isActive: false }),
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

// Alias for inbox message send compatibility
export const sendPrivateReply = sendZernioPrivateReply


export async function sendZernioPublicReply(
  platformPostId: string,
  commentId: string,
  accountId: string,
  message: string
): Promise<void> {
  await zernioFetch(
    `/inbox/comments/${encodeURIComponent(platformPostId)}/${encodeURIComponent(commentId)}/reply`,
    {
      method: 'POST',
      body: JSON.stringify({ accountId, message }),
    }
  )
}

export async function sendZernioImageInConversation(
  accountId: string,
  participantFbUserId: string,
  imageUrl: string
): Promise<boolean> {
  // After a private reply, find the conversation with that participant and send an image.
  // Zernio's private-reply endpoint creates/opens a Messenger conversation but returns no conversationId.
  // Strategy: list recent Facebook conversations for the account and match by participantId.
  // Facebook Messenger participant IDs (PSIDs) differ from Graph API user IDs, so we match
  // by scanning recent conversations — the one we just opened will be the most recent.
  const params = new URLSearchParams({ accountId, platform: 'facebook', limit: '10', sortOrder: 'desc' })
  let conversations: Array<{ id: string; participantId: string; updatedTime: string }> = []
  try {
    const res = await zernioFetch(`/inbox/conversations?${params}`)
    const data = await res.json()
    conversations = data.data ?? []
  } catch {
    return false
  }

  // The most recent conversation is likely the one we just opened.
  // Cross-check: Zernio may expose the Facebook user ID as participantId or a PSID derived from it.
  // We try exact match first, then fall back to the most-recent conversation (within 30s of now).
  const THIRTY_SECONDS = 30_000
  let convId: string | null = null
  for (const c of conversations) {
    if (c.participantId === participantFbUserId) { convId = c.id; break }
  }
  if (!convId && conversations.length > 0) {
    const newest = conversations[0]
    if (Date.now() - new Date(newest.updatedTime).getTime() < THIRTY_SECONDS) {
      convId = newest.id
    }
  }

  if (!convId) return false

  try {
    await zernioFetch(`/inbox/conversations/${convId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ accountId, attachmentUrl: imageUrl, attachmentType: 'image' }),
    })
    return true
  } catch {
    return false
  }
}

export async function sendZernioDirectMessage(
  accountId: string,
  recipientFbUserId: string,
  message: string
): Promise<void> {
  await zernioFetch('/inbox/messages', {
    method: 'POST',
    body: JSON.stringify({ accountId, recipientId: recipientFbUserId, message, platform: 'facebook' }),
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
      events: [
        'comment.received',
        'message.received',
        'message.sent',
        'message.edited',
        'message.deleted',
        'message.delivered',
        'message.read',
        'message.failed',
        'reaction.received',
        'conversation.started',
        'conversation.control_changed',
        'lead.received',
        'review.new',
        'review.updated',
        'account.connected',
        'account.disconnected',
        'referral.received',
      ],
      isActive: true,
    }),
  })
  const data = await res.json()
  return { id: data.webhook?._id ?? data.id ?? '' }
}

// Returns posts (with commentCount, picture, content)
export async function getZernioPosts(accountId: string, limit = 50): Promise<any> {
  const params = new URLSearchParams({ accountId, limit: String(limit) })
  const res = await zernioFetch('/inbox/comments?' + params.toString())
  return res.json()
}

// Returns comments for a specific post
export async function getZernioPostComments(postId: string, accountId: string): Promise<any> {
  const params = new URLSearchParams({ accountId })
  const res = await zernioFetch(`/inbox/comments/${encodeURIComponent(postId)}?${params}`)
  return res.json()
}

// Keep old name as alias
export const getZernioComments = getZernioPosts

export async function hideZernioComment(platformPostId: string, commentId: string, accountId: string): Promise<void> {
  await zernioFetch('/inbox/comments/' + encodeURIComponent(platformPostId) + '/' + encodeURIComponent(commentId) + '/hide', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  })
}

export async function deleteZernioComment(platformPostId: string, commentId: string, accountId: string): Promise<void> {
  await zernioFetch('/inbox/comments/' + encodeURIComponent(platformPostId) + '/' + encodeURIComponent(commentId), {
    method: 'DELETE',
    body: JSON.stringify({ accountId }),
  })
}
