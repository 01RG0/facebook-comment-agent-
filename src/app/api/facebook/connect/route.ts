import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConnectUrl } from '@/lib/zernio/client'
import { getRedisConnection } from '@/lib/queue/client'
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
  const redis = getRedisConnection()
  await redis.setex(`fb:oauth:state:${state}`, 600, user.id)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const callbackUrl = `${appUrl}/api/facebook/callback?state=${encodeURIComponent(state)}`

  let authUrl: string
  try {
    const result = await getConnectUrl(profileId, callbackUrl)
    authUrl = result.authUrl
  } catch (err) {
    const logger = (await import('@/lib/logger')).logger
    logger.error({ err: (err as Error).message }, 'Failed to get Zernio connect URL')
    return NextResponse.redirect(`${appUrl}/dashboard?error=connect_failed`)
  }

  return NextResponse.redirect(authUrl)
}
