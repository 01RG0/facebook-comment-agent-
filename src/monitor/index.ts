import { Queue } from 'bullmq'
import { createClient } from '@supabase/supabase-js'
import pino from 'pino'
import { getRedisConnection } from '@/lib/queue/client'

const log = pino({ level: 'info' })

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN ?? ''
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID ?? '6e10bcc7-de16-4de2-b02d-b918cb6c6360'
const ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID ?? '5c2acf85-52d4-43c0-a901-e4fd6bda45d9'

const SERVICE_IDS: Record<string, string> = {
  web: process.env.RAILWAY_WEB_SERVICE_ID ?? '4bc5d6ae-8f0b-4571-93a5-ccf28a4fb368',
  worker: process.env.RAILWAY_WORKER_SERVICE_ID ?? '74c3f068-192c-4546-8aa7-2bb24c1e642f',
  redis: process.env.RAILWAY_REDIS_SERVICE_ID ?? 'adf1b3b1-f02a-427d-a9e7-0093389959ce',
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Railway GraphQL helper ────────────────────────────────────────────────────

async function railwayGql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RAILWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json() as { data: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data
}

// ── Health event logger ───────────────────────────────────────────────────────

async function logEvent(
  service: string,
  status: 'ok' | 'warn' | 'error' | 'auto_healed',
  message: string,
  metadata?: Record<string, unknown>
) {
  log[status === 'error' ? 'error' : status === 'warn' ? 'warn' : 'info'](
    { service, status, metadata },
    message
  )
  await db.from('health_events').insert({ service, status, message, metadata })
}

// ── Check 1: Railway service health ──────────────────────────────────────────

async function checkRailwayServices() {
  for (const [name, serviceId] of Object.entries(SERVICE_IDS)) {
    try {
      const data = await railwayGql<{
        deployments: { edges: { node: { id: string; status: string } }[] }
      }>(`
        query($serviceId: String!, $projectId: String!) {
          deployments(input: { serviceId: $serviceId, projectId: $projectId }) {
            edges { node { id status } }
          }
        }
      `, { serviceId, projectId: PROJECT_ID })

      const latest = data.deployments.edges[0]?.node
      if (!latest) continue

      if (latest.status === 'CRASHED' || latest.status === 'FAILED') {
        await logEvent('railway', 'error', `${name} deployment CRASHED (${latest.id}) — attempting redeploy`, { serviceId, deploymentId: latest.id })

        // Find last SUCCESS to redeploy from
        const lastGood = data.deployments.edges.find(e => e.node.status === 'SUCCESS')
        if (lastGood) {
          await railwayGql(`mutation($id: String!) { deploymentRedeploy(id: $id) { id status } }`, { id: lastGood.node.id })
          await logEvent('railway', 'auto_healed', `${name} redeployed from last good deployment ${lastGood.node.id}`, { serviceId })
        } else {
          await logEvent('railway', 'warn', `${name} crashed but no prior SUCCESS deployment found — manual action needed`, { serviceId })
        }
      } else if (latest.status === 'SUCCESS') {
        // Only log ok once per hour to avoid spam — check if last ok was recent
        const { count } = await db
          .from('health_events')
          .select('*', { count: 'exact', head: true })
          .eq('service', 'railway')
          .eq('status', 'ok')
          .ilike('message', `%${name}%`)
          .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        if ((count ?? 0) === 0) {
          await logEvent('railway', 'ok', `${name} is healthy (${latest.status})`, { serviceId, deploymentId: latest.id })
        }
      }
    } catch (err) {
      await logEvent('railway', 'error', `Failed to check ${name}: ${(err as Error).message}`)
    }
  }
}

// ── Check 2: Redis health ─────────────────────────────────────────────────────

async function checkRedis() {
  const redis = getRedisConnection()
  try {
    const pong = await redis.ping()
    if (pong !== 'PONG') throw new Error(`Unexpected ping response: ${pong}`)
    const info = await redis.info('memory')
    const usedMem = info.match(/used_memory_human:(.+)/)?.[1]?.trim()
    log.info({ usedMem }, 'Redis healthy')
  } catch (err) {
    await logEvent('redis', 'error', `Redis ping failed: ${(err as Error).message}`)
  }
}

// ── Check 3: BullMQ queue health ──────────────────────────────────────────────

async function checkQueue() {
  const redis = getRedisConnection()
  const queue = new Queue('comment-replies', { connection: redis })

  try {
    const [waiting, active, failed, delayed, stalled] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.getStalledCount(),
    ])

    const stats = { waiting, active, failed, delayed, stalled }

    if (stalled > 0) {
      await logEvent('queue', 'warn', `${stalled} stalled jobs detected — worker may be unhealthy`, stats)
    }
    if (failed > 50) {
      await logEvent('queue', 'warn', `High failed job count: ${failed}`, stats)
    }
    if (waiting > 500) {
      await logEvent('queue', 'warn', `Queue backlog high: ${waiting} waiting`, stats)
    }

    log.info(stats, 'Queue stats')
  } catch (err) {
    await logEvent('queue', 'error', `Queue check failed: ${(err as Error).message}`)
  } finally {
    await queue.close()
  }
}

// ── Check 4: DLQ buildup ──────────────────────────────────────────────────────

async function checkDlq() {
  try {
    const { count } = await db
      .from('dead_letter_comments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')

    if ((count ?? 0) > 20) {
      await logEvent('dlq', 'warn', `DLQ has ${count} unresolved failed comments`, { count })
    }
  } catch (err) {
    await logEvent('dlq', 'error', `DLQ check failed: ${(err as Error).message}`)
  }
}

// ── Check 5: Expiring Facebook tokens ────────────────────────────────────────

async function checkTokenExpiry() {
  try {
    // Pages without a recent token refresh within 50 days (tokens last ~60 days)
    const { data: pages } = await db
      .from('pages')
      .select('id, page_name, user_id, token_expires_at')
      .lt('token_expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
      .not('token_expires_at', 'is', null)

    if (pages && pages.length > 0) {
      const names = pages.map((p: { page_name: string }) => p.page_name).join(', ')
      await logEvent('tokens', 'warn', `${pages.length} page(s) have tokens expiring within 7 days: ${names}`, { pages: pages.map((p: { id: string; page_name: string }) => ({ id: p.id, name: p.page_name })) })
    }
  } catch (_err) {
    // token_expires_at column may not exist — skip silently
  }
}

// ── Check 6: Supabase connectivity ───────────────────────────────────────────

async function checkSupabase() {
  try {
    const { error } = await db.from('profiles').select('id').limit(1)
    if (error) throw new Error(error.message)
  } catch (err) {
    await logEvent('supabase', 'error', `Supabase unreachable: ${(err as Error).message}`)
  }
}

// ── Check 7: Recent error spike ───────────────────────────────────────────────

async function checkErrorSpike() {
  try {
    const { count } = await db
      .from('comments_log')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())

    if ((count ?? 0) > 10) {
      await logEvent('worker', 'warn', `Error spike: ${count} failed comments in the last 15 minutes`, { count })
    }
  } catch (_err) {
    // ignore
  }
}

// ── Purge old health events (keep 7 days) ─────────────────────────────────────

async function purgeOldEvents() {
  await db
    .from('health_events')
    .delete()
    .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
}

// ── Main loop ─────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 2 * 60 * 1000 // every 2 minutes

async function runChecks() {
  log.info('Running health checks...')
  await Promise.allSettled([
    checkRedis(),
    checkQueue(),
    checkDlq(),
    checkSupabase(),
    checkErrorSpike(),
    checkTokenExpiry(),
  ])
  // Railway API checks are sequential to avoid rate limits
  if (RAILWAY_TOKEN) {
    await checkRailwayServices()
  } else {
    log.warn('RAILWAY_TOKEN not set — skipping Railway service health checks')
  }
}

// Purge once on startup, then daily
purgeOldEvents().catch(() => {})
setInterval(() => purgeOldEvents().catch(() => {}), 24 * 60 * 60 * 1000)

// Run immediately then on interval
runChecks().catch(err => log.error({ err: err.message }, 'Health check run failed'))
setInterval(() => {
  runChecks().catch(err => log.error({ err: err.message }, 'Health check run failed'))
}, CHECK_INTERVAL_MS)

log.info({ interval: `${CHECK_INTERVAL_MS / 1000}s` }, 'Monitor service started')
