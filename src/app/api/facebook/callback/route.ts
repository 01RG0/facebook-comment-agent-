import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const accountId = searchParams.get('accountId')
  const username = searchParams.get('username')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

  // Log all params Zernio sends back for debugging
  logger.info(
    { params: Object.fromEntries(searchParams.entries()) },
    'Zernio OAuth callback received'
  )

  // 1. Error check
  if (error) {
    logger.warn({ error }, 'Facebook OAuth denied or returned error')
    return NextResponse.redirect(`${appUrl}/dashboard?error=facebook_denied`)
  }

  // 2. CSRF check via cookie
  const oauthCookie = req.cookies.get('_oauth_state')?.value
  if (!oauthCookie) {
    logger.warn('Facebook OAuth missing _oauth_state cookie — possible CSRF or expired session')
    return NextResponse.redirect(`${appUrl}/dashboard?error=invalid_state`)
  }

  const [, cookieUserId] = oauthCookie.split(':')
  if (!cookieUserId) {
    logger.warn('Facebook OAuth _oauth_state cookie malformed')
    return NextResponse.redirect(`${appUrl}/dashboard?error=invalid_state`)
  }

  // 3. Verify session user matches cookie
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== cookieUserId) {
    logger.warn({ cookieUserId, sessionUserId: user?.id }, 'OAuth user mismatch or no session')
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
    const successRes = NextResponse.redirect(`${appUrl}/dashboard?success=connected`)
    successRes.cookies.delete('_oauth_state')
    return successRes
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Zernio Facebook callback error')
    return NextResponse.redirect(`${appUrl}/dashboard?error=callback_failed`)
  }
}
