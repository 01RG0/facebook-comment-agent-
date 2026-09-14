import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getZernioReviews } from '@/lib/zernio/client'
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
    const cursor = searchParams.get('cursor') || undefined

    let pagesQuery = supabase
      .from('pages')
      .select('id, page_name, zernio_account_id')
      .eq('user_id', user.id)

    if (pageId) pagesQuery = pagesQuery.eq('id', pageId)

    const { data: pages, error: pagesError } = await pagesQuery
    if (pagesError) return NextResponse.json({ error: pagesError.message }, { status: 500 })

    const reviews: any[] = []
    let nextCursor: string | null = null

    await Promise.all(
      (pages ?? []).map(async (page) => {
        if (!page.zernio_account_id) return
        try {
          const data = await getZernioReviews(page.zernio_account_id, 50, cursor)
          const cursorFound = data?.pagination?.nextCursor ?? data?.nextCursor ?? null
          if (cursorFound) {
            nextCursor = cursorFound
          }
          const items: any[] = Array.isArray(data?.reviews)
            ? data.reviews
            : Array.isArray(data?.data)
              ? data.data
              : []

          for (const item of items) {
            // Check reply from potential fields
            const hasReply = Boolean(item.hasReply || item.reply || item.replyText || item.reply_comment || item.replyMessage)
            const replyObj = item.reply ?? {}
            const replyText = typeof item.reply === 'string'
              ? item.reply
              : item.replyText ?? replyObj.message ?? replyObj.text ?? item.reply_comment?.message ?? null
            const replyCreatedTime = item.replyCreatedTime ?? replyObj.createdTime ?? replyObj.created_time ?? null

            reviews.push({
              id: String(item.id ?? item.reviewId ?? ''),
              accountId: String(item.accountId ?? page.zernio_account_id),
              reviewerName: item.reviewerName ?? item.reviewer?.name ?? item.from?.name ?? 'Anonymous',
              reviewerPicture: item.reviewerPicture ?? item.reviewer?.picture ?? item.from?.picture ?? null,
              rating: typeof item.rating === 'number' ? item.rating : (item.rating ? Number(item.rating) : 5),
              text: item.text ?? item.message ?? item.reviewText ?? item.content ?? '',
              createdTime: item.createdTime ?? item.created_time ?? new Date().toISOString(),
              hasReply: Boolean(hasReply && replyText),
              replyText,
              replyCreatedTime,
              page_id: page.id,
              page_name: page.page_name,
              zernio_account_id: page.zernio_account_id,
            })
          }
        } catch (err: any) {
          logger.warn({ pageId: page.id, err: err?.message }, 'Failed to fetch Zernio reviews')
        }
      })
    )

    // Sort newest first
    reviews.sort((a, b) => {
      const ta = a.createdTime ? new Date(a.createdTime).getTime() : 0
      const tb = b.createdTime ? new Date(b.createdTime).getTime() : 0
      return tb - ta
    })

    return NextResponse.json({ reviews, nextCursor })
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Unexpected error in GET /api/reviews')
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
