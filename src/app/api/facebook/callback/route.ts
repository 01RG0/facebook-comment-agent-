import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRedisConnection } from '@/lib/queue/client'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const connected = searchParams.get('connected')
  const accountId = searchParams.get('accountId')
  const username = searchParams.get('username')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

  // 1. Error check
  if (error) {
    logger.warn({ error }, 'Facebook OAuth denied or returned error')
    return NextResponse.redirect(`${appUrl}/dashboard?error=facebook_denied`)
  }

  // 2. CSRF check via Redis
  if (!state) {
    logger.warn('Facebook OAuth missing state param')
    return NextResponse.redirect(`${appUrl}/dashboard?error=invalid_state`)
  }

  const redis = getRedisConnection()
  const savedUserId = await redis.get(`fb:oauth:state:${state}`)

  if (!savedUserId) {
    logger.warn('Facebook OAuth state not found in Redis — expired or invalid')
    return NextResponse.redirect(`${appUrl}/dashboard?error=invalid_state`)
  }

  await redis.del(`fb:oauth:state:${state}`)

  // 3. Verify session user
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== savedUserId) {
    return NextResponse.redirect(`${appUrl}/auth/login`)
  }

  // 4. Validate accountId
  if (!accountId) {
    logger.warn('Facebook OAuth callback missing accountId')
    return NextResponse.redirect(`${appUrl}/dashboard?error=no_account_id`)
  }

  const zernioProfileId = process.env.ZERNIO_PROFILE_ID ?? null
  const pageName = username || 'Facebook Page'

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // 5. Upsert page row: ON CONFLICT (user_id, zernio_account_id) DO UPDATE
    const { data: page, error: upsertErr } = await db
      .from('pages')
      .upsert(
        {
          user_id: user.id,
          page_name: pageName,
          fb_page_id: `zernio:${accountId}`,
          zernio_account_id: accountId,
          zernio_profile_id: zernioProfileId,
        },
        { onConflict: 'user_id, zernio_account_id' }
      )
      .select('id')
      .single()

    if (upsertErr || !page) {
      logger.error({ err: upsertErr?.message, accountId }, 'Failed to upsert page row')
      return NextResponse.redirect(`${appUrl}/dashboard?error=callback_failed`)
    }

    // 6. Create default settings row for new pages (insert if not exists)
    const { data: existingSettings } = await db
      .from('settings')
      .select('id')
      .eq('page_id', page.id)
      .maybeSingle()

    if (!existingSettings) {
      const { error: settingsErr } = await db.from('settings').insert({
        page_id: page.id,
        user_id: user.id,
      })
      if (settingsErr) {
        logger.warn({ err: settingsErr.message, pageId: page.id }, 'Failed to create default settings')
      }
    }

    logger.info({ userId: user.id, accountId, pageId: page.id }, 'Facebook page connected via Zernio')
    return NextResponse.redirect(`${appUrl}/dashboard?success=connected`)
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Zernio Facebook callback error')
    return NextResponse.redirect(`${appUrl}/dashboard?error=callback_failed`)
  }
}
