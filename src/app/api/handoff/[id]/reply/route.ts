import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendZernioPrivateReply, sendZernioPublicReply } from '@/lib/zernio/client'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reply_text } = await req.json()
  if (!reply_text?.trim()) return NextResponse.json({ error: 'reply_text required' }, { status: 400 })

  // RLS allows both the page owner and reviewer/editor team members to read this row
  const { data: item } = await supabase
    .from('handoff_queue')
    .select('id, fb_comment_id, page_id, user_id, status')
    .eq('id', params.id)
    .single()

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (item.status !== 'pending') return NextResponse.json({ error: 'Already handled' }, { status: 409 })

  const db = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminDb = db as any

  const { data: page } = await adminDb
    .from('pages')
    .select('zernio_account_id, fb_page_id')
    .eq('id', item.page_id)
    .single()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const { data: logRow } = await adminDb
    .from('comments_log')
    .select('fb_post_id')
    .eq('fb_comment_id', item.fb_comment_id)
    .maybeSingle()

  const platformPostId = logRow?.fb_post_id ?? ''

  await sendZernioPrivateReply(
    platformPostId,
    item.fb_comment_id,
    page.zernio_account_id ?? '',
    reply_text
  )

  // Post public comment reply on approval if configured
  const { data: settings } = await adminDb
    .from('settings')
    .select('public_comment_reply_enabled, public_comment_reply_text, public_comment_on_approval')
    .eq('page_id', item.page_id)
    .single()

  if (
    settings?.public_comment_reply_enabled &&
    settings?.public_comment_on_approval &&
    settings?.public_comment_reply_text
  ) {
    try {
      await sendZernioPublicReply(
        platformPostId,
        item.fb_comment_id,
        page.zernio_account_id ?? '',
        settings.public_comment_reply_text
      )
    } catch {
      // non-fatal — private reply already sent
    }
  }

  await supabase
    .from('handoff_queue')
    .update({ status: 'replied', notes: reply_text })
    .eq('id', params.id)

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS allows owner + reviewer/editor team members to update
  const { error } = await supabase
    .from('handoff_queue')
    .update({ status: 'dismissed' })
    .eq('id', params.id)
    .eq('status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
