import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { disconnectAccount } from '@/lib/zernio/client'
import { logger } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pageId } = await req.json().catch(() => ({}))
  if (!pageId) return NextResponse.json({ error: 'pageId required' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data: page } = await db
    .from('pages')
    .select('id, user_id, zernio_account_id')
    .eq('id', pageId)
    .eq('user_id', user.id)
    .single()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  if (page.zernio_account_id) {
    try {
      await disconnectAccount(page.zernio_account_id)
      logger.info({ pageId, accountId: page.zernio_account_id }, 'Disconnected Zernio account')
    } catch (err) {
      logger.warn({ err: (err as Error).message, pageId, accountId: page.zernio_account_id }, 'Failed to disconnect Zernio account (continuing)')
    }
  }

  await db.from('pages').delete().eq('id', pageId).eq('user_id', user.id)

  return NextResponse.json({ success: true })
}
