import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getZernioPosts, getZernioPostComments } from '@/lib/zernio/client'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const pageId = searchParams.get('pageId')
    const postId = searchParams.get('postId')
    const accountId = searchParams.get('accountId')

    // If postId + accountId: return comments for that specific post
    if (postId && accountId) {
      // Verify user owns a page with this accountId
      const { data: page } = await supabase
        .from('pages')
        .select('id')
        .eq('user_id', user.id)
        .eq('zernio_account_id', accountId)
        .maybeSingle()

      if (!page) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const data = await getZernioPostComments(postId, accountId)
      // Zernio returns { status, comments: [...] }
      const comments: any[] = Array.isArray(data?.comments) ? data.comments : []

      const normalized = comments.map((c: any) => ({
        id: String(c.id),
        message: c.message ?? '',
        authorName: c.from?.name ?? 'Anonymous',
        authorPicture: c.from?.picture ?? null,
        authorId: String(c.from?.id ?? ''),
        isOwner: c.from?.isOwner ?? false,
        createdTime: c.createdTime ?? c.created_time,
        isHidden: c.isHidden ?? false,
        canReply: c.canReply ?? true,
        canDelete: c.canDelete ?? false,
        canHide: c.canHide ?? true,
        platform: c.platform ?? 'facebook',
      }))

      return NextResponse.json({ comments: normalized })
    }

    // Otherwise: return posts list for all user pages
    let pagesQuery = supabase
      .from('pages')
      .select('id, page_name, zernio_account_id')
      .eq('user_id', user.id)

    if (pageId) pagesQuery = pagesQuery.eq('id', pageId)

    const { data: pages, error: pagesError } = await pagesQuery
    if (pagesError) return NextResponse.json({ error: pagesError.message }, { status: 500 })

    const posts: any[] = []

    await Promise.all(
      (pages ?? []).map(async (page) => {
        if (!page.zernio_account_id) return
        try {
          const data = await getZernioPosts(page.zernio_account_id)
          const items: any[] = Array.isArray(data?.data) ? data.data : []
          for (const item of items) {
            posts.push({
              id: String(item.id),
              accountId: String(item.accountId ?? page.zernio_account_id),
              accountUsername: item.accountUsername ?? page.page_name,
              caption: item.content ?? item.caption ?? '',
              picture: item.picture ?? null,
              commentCount: item.commentCount ?? 0,
              likeCount: item.likeCount ?? 0,
              createdTime: item.createdTime,
              permalink: item.permalink ?? null,
              page_id: page.id,
              page_name: page.page_name,
              zernio_account_id: page.zernio_account_id,
            })
          }
        } catch (err: any) {
          logger.warn({ pageId: page.id, err: err?.message }, 'Failed to fetch Zernio posts')
        }
      })
    )

    return NextResponse.json({ posts })
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Unexpected error in GET /api/comments')
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
