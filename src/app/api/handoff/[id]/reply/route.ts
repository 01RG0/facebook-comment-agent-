import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'
import { sendPrivateReply } from '@/lib/facebook/graph'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reply_text } = await req.json()
  if (!reply_text?.trim()) return NextResponse.json({ error: 'reply_text required' }, { status: 400 })

  const { data: item } = await supabase
    .from('handoff_queue')
    .select('id, fb_comment_id, page_id, user_id, status')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (item.status !== 'pending') return NextResponse.json({ error: 'Already handled' }, { status: 409 })

  // Get the page token via admin client (decrypt server-side)
  const db = getAdminClient()
  const { data: page } = await db
    .from('pages')
    .select('access_token_enc, access_token_iv')
    .eq('id', item.page_id)
    .single()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const pageToken = decrypt(page.access_token_enc, page.access_token_iv)
  await sendPrivateReply(item.fb_comment_id, reply_text, pageToken)

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

  const { error } = await supabase
    .from('handoff_queue')
    .update({ status: 'dismissed' })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .eq('status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
