import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { replyToZernioReview, deleteZernioReviewReply } from '@/lib/zernio/client'
import { logger } from '@/lib/logger'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const reviewId = params.id
    if (!reviewId) {
      return NextResponse.json({ error: 'Missing review id parameter' }, { status: 400 })
    }

    let body: {
      action?: string
      accountId?: string
      message?: string
    }

    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { action, accountId, message } = body

    if (!action || !accountId) {
      return NextResponse.json({ error: 'Missing action or accountId' }, { status: 400 })
    }

    // Verify user owns a page with this accountId
    const { data: page, error: pageError } = await supabase
      .from('pages')
      .select('id, zernio_account_id')
      .eq('user_id', user.id)
      .eq('zernio_account_id', accountId)
      .maybeSingle()

    if (pageError || !page) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    switch (action) {
      case 'reply': {
        if (!message || !message.trim()) {
          return NextResponse.json({ error: 'message is required for reply' }, { status: 400 })
        }
        await replyToZernioReview(reviewId, accountId, message.trim())
        break
      }
      case 'delete-reply': {
        await deleteZernioReviewReply(reviewId, accountId)
        break
      }
      default:
        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Error in POST /api/reviews/[id]')
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 })
  }
}
