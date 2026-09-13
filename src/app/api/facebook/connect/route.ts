import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConnectUrl } from '@/lib/zernio/client'
import { logger } from '@/lib/logger'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profileId = process.env.ZERNIO_PROFILE_ID
  if (!profileId) {
    return NextResponse.json({ error: 'ZERNIO_PROFILE_ID is not configured' }, { status: 500 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  // Pass only the base callback URL — Zernio will append its own params
  const callbackUrl = `${appUrl}/api/facebook/callback`

  let authUrl: string
  try {
    const result = await getConnectUrl(profileId, callbackUrl)
    authUrl = result.authUrl
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to get Zernio connect URL')
    return NextResponse.redirect(`${appUrl}/dashboard?error=connect_failed`)
  }

  // Store state+userId in a cookie — more reliable than Redis across OAuth redirects
  const res = NextResponse.redirect(authUrl)
  res.cookies.set('_oauth_state', `${state}:${user.id}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
