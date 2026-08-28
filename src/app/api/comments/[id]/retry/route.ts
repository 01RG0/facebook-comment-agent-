import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCommentQueue } from '@/lib/queue/client'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: comment } = await supabase
    .from('comments_log')
    .select('id, page_id, fb_comment_id, fb_post_id, commenter_id, commenter_name, comment_text, user_id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: page } = await supabase
    .from('pages')
    .select('fb_page_id')
    .eq('id', comment.page_id)
    .single()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const queue = getCommentQueue()
  await queue.add(
    'comment',
    {
      pageId: comment.page_id,
      fbPageId: page.fb_page_id,
      commentId: comment.fb_comment_id,
      postId: comment.fb_post_id,
      from: { id: comment.commenter_id, name: comment.commenter_name },
      message: comment.comment_text,
      createdTime: Date.now(),
    },
    { jobId: `retry-${comment.fb_comment_id}-${Date.now()}` }
  )

  await supabase
    .from('comments_log')
    .update({ status: 'pending', error_message: null })
    .eq('id', params.id)

  return NextResponse.json({ success: true })
}
