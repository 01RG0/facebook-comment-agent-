import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getZernioComments } from '@/lib/zernio/client'
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

    let pagesQuery = supabase
      .from('pages')
      .select('id, page_name, zernio_account_id')
      .eq('user_id', user.id)

    if (pageId) {
      pagesQuery = pagesQuery.eq('id', pageId)
    }

    const { data: pages, error: pagesError } = await pagesQuery

    if (pagesError) {
      logger.error({ err: pagesError.message }, 'Failed to fetch user pages for comments')
      return NextResponse.json({ error: pagesError.message }, { status: 500 })
    }

    const results: any[] = []

    if (pages && pages.length > 0) {
      await Promise.all(
        pages.map(async (page) => {
          if (!page.zernio_account_id) return

          try {
            const zernioData = await getZernioComments(page.zernio_account_id)
            
            // Zernio may return an array directly or { data: [...] } or { posts: [...] } or { comments: [...] }
            let items: any[] = []
            if (Array.isArray(zernioData)) {
              items = zernioData
            } else if (Array.isArray(zernioData?.data)) {
              items = zernioData.data
            } else if (Array.isArray(zernioData?.comments)) {
              items = zernioData.comments
            } else if (Array.isArray(zernioData?.posts)) {
              items = zernioData.posts
            } else if (zernioData && typeof zernioData === 'object') {
              // If wrapped in another property or single item
              items = [zernioData]
            }

            for (const item of items) {
              results.push({
                ...item,
                page_id: page.id,
                page_name: page.page_name,
              })
            }
          } catch (pageErr: any) {
            logger.warn(
              { pageId: page.id, accountId: page.zernio_account_id, err: pageErr?.message },
              'Failed to fetch Zernio comments for page'
            )
            // Skip failed page as instructed
          }
        })
      )
    }

    // Optional aiReplied filter or checking comments_log
    const checkAiReplied = searchParams.get('aiReplied')
    if (checkAiReplied === '1') {
      const { data: repliedLogs } = await supabase
        .from('comments_log')
        .select('fb_comment_id')
        .eq('user_id', user.id)
        .eq('status', 'replied')

      const repliedCommentIds = new Set(repliedLogs?.map((l: { fb_comment_id: string }) => l.fb_comment_id) ?? [])
      return NextResponse.json({ data: results, repliedCommentIds: Array.from(repliedCommentIds) })
    }

    return NextResponse.json({ data: results })
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Unexpected error in GET /api/comments')
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
