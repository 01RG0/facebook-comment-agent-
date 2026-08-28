import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForToken, getLongLivedToken } from '@/lib/facebook/oauth'
import { getMe, subscribePageToWebhook } from '@/lib/facebook/graph'
import { encrypt } from '@/lib/crypto'
import { cookies } from 'next/headers'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  // User denied permission
  if (error) {
    logger.warn({ error }, 'Facebook OAuth denied by user')
    return NextResponse.redirect(`${appUrl}/dashboard?error=facebook_denied`)
  }

  // ── CSRF check ─────────────────────────────────────────────────────────────
  const cookieStore = cookies()
  const savedState = cookieStore.get('fb_oauth_state')?.value

  if (!state || !savedState || state !== savedState) {
    logger.warn('Facebook OAuth state mismatch — possible CSRF')
    return NextResponse.redirect(`${appUrl}/dashboard?error=invalid_state`)
  }

  // Clear the state cookie
  cookieStore.delete('fb_oauth_state')

  if (!code) {
    return NextResponse.redirect(`${appUrl}/dashboard?error=no_code`)
  }

  // ── Auth check ─────────────────────────────────────────────────────────────
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/auth/login`)

  try {
    // ── Exchange code for short-lived token ───────────────────────────────
    const shortToken = await exchangeCodeForToken(code)

    // ── Exchange for long-lived (60-day) token ────────────────────────────
    const longToken = await getLongLivedToken(shortToken.access_token)

    // ── Fetch pages the user manages ─────────────────────────────────────
    const me = await getMe(longToken.access_token)
    const fbPages = me.accounts?.data ?? []

    if (fbPages.length === 0) {
      return NextResponse.redirect(`${appUrl}/dashboard?error=no_pages`)
    }

    // ── Store each page ───────────────────────────────────────────────────
    for (const fbPage of fbPages) {
      const { enc, iv } = encrypt(fbPage.access_token)

      // biome-ignore lint: supabase type inference workaround
      // eslint-disable-next-line
      const db = supabase as any
      const existingResult = await db
        .from('pages')
        .select('id')
        .eq('user_id', user.id)
        .eq('fb_page_id', fbPage.id)
        .maybeSingle()
      const existing = existingResult.data as { id: string } | null

      if (existing) {
        // Update token if page already connected
        await db
          .from('pages')
          .update({
            page_name: fbPage.name,
            page_picture_url: fbPage.picture?.data?.url ?? null,
            access_token_enc: enc,
            access_token_iv: iv,
          })
          .eq('id', existing.id)
      } else {
        // Insert new page
        const { data: newPage, error: insertErr } = await db
          .from('pages')
          .insert({
            user_id: user.id,
            fb_page_id: fbPage.id,
            page_name: fbPage.name,
            page_picture_url: fbPage.picture?.data?.url ?? null,
            access_token_enc: enc,
            access_token_iv: iv,
          })
          .select('id')
          .single()

        if (insertErr || !newPage) {
          logger.error({ err: insertErr?.message, fbPageId: fbPage.id }, 'Failed to insert page')
          continue
        }

        // Create default settings for new page
        await db.from('settings').insert({
          page_id: newPage.id,
          user_id: user.id,
        })

        // Subscribe to webhook
        try {
          await subscribePageToWebhook(fbPage.id, fbPage.access_token)
          await db
            .from('pages')
            .update({ webhook_subscribed: true })
            .eq('id', newPage.id)
        } catch (webhookErr) {
          logger.error({ err: (webhookErr as Error).message, fbPageId: fbPage.id }, 'Webhook subscribe failed')
        }
      }
    }

    logger.info({ userId: user.id, pageCount: fbPages.length }, 'Facebook pages connected')
    return NextResponse.redirect(`${appUrl}/dashboard?success=connected`)
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Facebook callback error')
    return NextResponse.redirect(`${appUrl}/dashboard?error=callback_failed`)
  }
}
