import { randomBytes } from 'crypto'

const FACEBOOK_OAUTH_URL = 'https://www.facebook.com/v21.0/dialog/oauth'
const FACEBOOK_TOKEN_URL = 'https://graph.facebook.com/v21.0/oauth/access_token'
const PERMISSIONS = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_messaging',
  'pages_read_user_content',
].join(',')

export function generateState(): string {
  return randomBytes(24).toString('hex')
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/facebook/callback`,
    scope: PERMISSIONS,
    state,
    response_type: 'code',
  })
  return `${FACEBOOK_OAUTH_URL}?${params}`
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/facebook/callback`,
    code,
  })

  const res = await fetch(`${FACEBOOK_TOKEN_URL}?${params}`)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Facebook token exchange failed: ${err}`)
  }
  return res.json() as Promise<TokenResponse>
}

export async function getLongLivedToken(shortToken: string): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortToken,
  })

  const res = await fetch(`${FACEBOOK_TOKEN_URL}?${params}`)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Facebook long-lived token exchange failed: ${err}`)
  }
  return res.json() as Promise<TokenResponse>
}
