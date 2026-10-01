import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { getZernioAccount } from '@/lib/zernio/client'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminClient()
  const { data: pages, error } = await db
    .from('pages')
    .select('id, page_name, zernio_account_id, agent_enabled')
    .not('zernio_account_id', 'is', null)

  if (error) {
    logger.error({ err: error.message }, 'Token health check: failed to load pages')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results = await Promise.all(
    (pages ?? []).map(async (page) => {
      const account = await getZernioAccount(page.zernio_account_id!)
      const healthy = account !== null
      if (!healthy) {
        logger.warn({ pageId: page.id, pageName: page.page_name }, 'Token health check: Zernio account unreachable — connection may need re-auth')
      }
      return { pageId: page.id, pageName: page.page_name, healthy }
    })
  )

  const unhealthy = results.filter(r => !r.healthy)
  logger.info({ checked: results.length, unhealthy: unhealthy.length }, 'Token health check completed')

  return NextResponse.json({ checked: results.length, unhealthy: unhealthy.length, results })
}
