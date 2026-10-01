import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getZernioPosts, getZernioPostComments } from '@/lib/zernio/client'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

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
    const cursor = searchParams.get('cursor') || undefined

    // Per-account cursors map for posts pagination (replaces single cursor)
    let cursorsIn: Record<string, string> = {}
    const cursorsParam = searchParams.get('cursors')
    if (cursorsParam) {
      try { cursorsIn = JSON.parse(cursorsParam) } catch {}
    }

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

      const data = await getZernioPostComments(postId, accountId, undefined, cursor)
      // Zernio returns { status, comments: [...], pagination: { nextCursor } } or nextCursor field
      const comments: any[] = Array.isArray(data?.comments) ? data.comments : []
      const nextCursor = data?.pagination?.nextCursor ?? data?.nextCursor ?? null

      const normalized = comments.map((c: any) => ({
        id: String(c.id),
        message: c.message ?? '',
        authorName: c.from?.name ?? 'Anonymous',
        authorPicture: c.from?.picture ?? null,
        authorId: String(c.from?.id ?? ''),
        isOwner: c.from?.isOwner ?? false,
        createdTime: c.createdTime ?? c.created_time,
        isHidden: c.isHidden ?? false,
        isLiked: c.isLiked ?? false,
        canReply: c.canReply ?? true,
        canDelete: c.canDelete ?? false,
        canHide: c.canHide ?? true,
        canLike: c.canLike ?? true,
        platform: c.platform ?? 'facebook',
      }))

      return NextResponse.json({ comments: normalized, nextCursor })
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
    const cursorsOut: Record<string, string> = {}

    await Promise.all(
      (pages ?? []).map(async (page) => {
        if (!page.zernio_account_id) return
        try {
          const accountCursor = cursorsIn[page.zernio_account_id] ?? cursor
          const data = await getZernioPosts(page.zernio_account_id, 50, accountCursor)
          const cursorFound = data?.pagination?.nextCursor ?? data?.nextCursor ?? null
          if (cursorFound) cursorsOut[page.zernio_account_id] = cursorFound
          const items: any[] = Array.isArray(data?.data) ? data.data : []
          for (const item of items) {
            logger.debug({ item }, 'Zernio post item fields')
            posts.push({
              id: String(item.id ?? item._id),
              accountId: String(item.accountId ?? page.zernio_account_id),
              accountUsername: item.accountUsername ?? page.page_name,
              caption: item.message ?? item.text ?? item.content ?? item.caption ?? item.story ?? '',
              picture: item.picture ?? item.image ?? item.thumbnail ?? item.fullPicture ?? item.media?.image?.src ?? item.attachments?.[0]?.media?.image?.src ?? null,
              commentCount: item.commentCount ?? item.comments?.count ?? item.comments_count ?? 0,
              likeCount: item.likeCount ?? item.likes?.count ?? item.reactions_count ?? 0,
              createdTime: item.createdTime ?? item.created_time ?? item.timestamp,
              permalink: item.permalink ?? item.link ?? item.url ?? item.permalinkUrl ?? item.postUrl ?? null,
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

    return NextResponse.json({ posts, cursors: cursorsOut })
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Unexpected error in GET /api/comments')
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
