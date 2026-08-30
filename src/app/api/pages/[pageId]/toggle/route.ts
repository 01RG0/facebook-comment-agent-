import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { subscribePageToWebhook } from '@/lib/facebook/graph'
import { logger } from '@/lib/logger'

export async function POST(
  req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { enabled } = await req.json()
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 })
  }

  // When re-enabling, re-subscribe to Facebook webhooks to wake up delivery
  if (enabled) {
    const { data: page } = await supabase
      .from('pages')
      .select('fb_page_id, access_token_enc, access_token_iv')
      .eq('id', params.pageId)
      .eq('user_id', user.id)
      .single()

    if (page) {
      try {
        const pageToken = decrypt(page.access_token_enc, page.access_token_iv)
        await subscribePageToWebhook(page.fb_page_id, pageToken)
        logger.info({ pageId: params.pageId }, 'Re-subscribed page to Facebook webhooks')
      } catch (err) {
        logger.warn({ err: (err as Error).message, pageId: params.pageId }, 'Failed to re-subscribe webhook on toggle')
      }
    }
  }

  const { data, error } = await supabase
    .from('pages')
    .update({ agent_enabled: enabled })
    .eq('id', params.pageId)
    .eq('user_id', user.id)
    .select('id, agent_enabled')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  return NextResponse.json(data)
}
