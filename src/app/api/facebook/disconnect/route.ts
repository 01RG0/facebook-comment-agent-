import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unsubscribePageFromWebhook } from '@/lib/facebook/graph'
import { decrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pageId } = await req.json()
  if (!pageId) return NextResponse.json({ error: 'pageId required' }, { status: 400 })

  const { data: page } = await supabase
    .from('pages')
    .select('id, user_id, fb_page_id, access_token_enc, access_token_iv')
    .eq('id', pageId)
    .eq('user_id', user.id)
    .single()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  try {
    const token = decrypt(page.access_token_enc, page.access_token_iv)
    await unsubscribePageFromWebhook(page.fb_page_id, token)
  } catch (err) {
    logger.warn({ err: (err as Error).message, pageId }, 'Failed to unsubscribe webhook (continuing)')
  }

  await supabase.from('pages').delete().eq('id', pageId).eq('user_id', user.id)

  return NextResponse.json({ success: true })
}
