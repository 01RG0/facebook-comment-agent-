import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAuthUrl, generateState } from '@/lib/facebook/oauth'
import { getRedisConnection } from '@/lib/queue/client'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = generateState()
  const redis = getRedisConnection()
  await redis.setex(`fb:oauth:state:${state}`, 600, user.id)

  return NextResponse.redirect(buildAuthUrl(state))
}
