import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  sendZernioPublicReply,
  sendZernioDirectMessage,
  hideZernioComment,
  unhideZernioComment,
  likeZernioComment,
  unlikeZernioComment,
  deleteZernioComment,
} from '@/lib/zernio/client'
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

    const id = params.id
    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
    }

    let body: {
      action?: string
      platformPostId?: string
      accountId?: string
      message?: string
      recipientId?: string
    }

    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { action, platformPostId, accountId, message, recipientId } = body

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
        if (!platformPostId || !message) {
          return NextResponse.json({ error: 'platformPostId and message required for reply' }, { status: 400 })
        }
        await sendZernioPublicReply(platformPostId, id, accountId, message)
        break
      }
      case 'dm': {
        if (!recipientId || !message) {
          return NextResponse.json({ error: 'recipientId and message required for dm' }, { status: 400 })
        }
        await sendZernioDirectMessage(accountId, recipientId, message)
        break
      }
      case 'hide': {
        if (!platformPostId) {
          return NextResponse.json({ error: 'platformPostId required for hide' }, { status: 400 })
        }
        await hideZernioComment(platformPostId, id, accountId)
        break
      }
      case 'unhide': {
        if (!platformPostId) {
          return NextResponse.json({ error: 'platformPostId required for unhide' }, { status: 400 })
        }
        await unhideZernioComment(platformPostId, id, accountId)
        break
      }
      case 'like': {
        if (!platformPostId) {
          return NextResponse.json({ error: 'platformPostId required for like' }, { status: 400 })
        }
        await likeZernioComment(platformPostId, id, accountId)
        break
      }
      case 'unlike': {
        if (!platformPostId) {
          return NextResponse.json({ error: 'platformPostId required for unlike' }, { status: 400 })
        }
        await unlikeZernioComment(platformPostId, id, accountId)
        break
      }
      case 'delete': {
        if (!platformPostId) {
          return NextResponse.json({ error: 'platformPostId required for delete' }, { status: 400 })
        }
        await deleteZernioComment(platformPostId, id, accountId)
        break
      }
      default:
        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Error in POST /api/comments/[id]')
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 })
  }
}
