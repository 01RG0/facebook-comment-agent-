const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

export interface FbPage {
  id: string
  name: string
  picture?: { data: { url: string } }
  access_token: string
}

export interface MeResponse {
  id: string
  name: string
  accounts?: { data: FbPage[] }
}

export async function getMe(userToken: string): Promise<MeResponse> {
  const res = await fetch(
    `${GRAPH_BASE}/me?fields=id,name,accounts{id,name,picture,access_token}`,
    { headers: { Authorization: `Bearer ${userToken}` } }
  )
  if (!res.ok) throw new Error(`Graph API /me failed: ${await res.text()}`)
  return res.json()
}

export async function subscribePageToWebhook(
  fbPageId: string,
  pageToken: string
): Promise<void> {
  const res = await fetch(
    `${GRAPH_BASE}/${fbPageId}/subscribed_apps`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: 'feed',
        access_token: pageToken,
      }),
    }
  )
  if (!res.ok) throw new Error(`Webhook subscribe failed: ${await res.text()}`)
}

export async function unsubscribePageFromWebhook(
  fbPageId: string,
  pageToken: string
): Promise<void> {
  const res = await fetch(
    `${GRAPH_BASE}/${fbPageId}/subscribed_apps`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${pageToken}` } }
  )
  if (!res.ok) throw new Error(`Webhook unsubscribe failed: ${await res.text()}`)
}

export async function sendPrivateReply(
  commentId: string,
  message: string,
  pageToken: string
): Promise<{ id: string }> {
  const res = await fetch(`${GRAPH_BASE}/${commentId}/private_replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: pageToken }),
  })
  if (!res.ok) throw new Error(`Private reply failed: ${await res.text()}`)
  return res.json()
}

export async function refreshLongLivedToken(
  pageId: string,
  pageToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: pageToken,
  })
  const res = await fetch(
    `${GRAPH_BASE}/oauth/access_token?${params}`
  )
  if (!res.ok) throw new Error(`Token refresh failed for page ${pageId}: ${await res.text()}`)
  return res.json()
}
