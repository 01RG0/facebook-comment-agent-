import { Queue } from 'bullmq'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import pino from 'pino'
import { getRedisConnection } from '@/lib/queue/client'
import { decrypt } from '@/lib/crypto'

const log = pino({ level: 'info' })

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN ?? ''
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID ?? ''
const APP_URL = process.env.WEB_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''

const SERVICE_IDS: Record<string, string> = {
  web:    process.env.RAILWAY_WEB_SERVICE_ID    ?? '',
  worker: process.env.RAILWAY_WORKER_SERVICE_ID ?? '',
  redis:  process.env.RAILWAY_REDIS_SERVICE_ID  ?? '',
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { headers: {} }, realtime: { transport: WebSocket as any } }
)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function railwayGql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RAILWAY_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json() as { data: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data
}

async function logEvent(
  service: string,
  status: 'ok' | 'warn' | 'error' | 'auto_healed',
  message: string,
  metadata?: Record<string, unknown>
) {
  log[status === 'error' ? 'error' : status === 'warn' ? 'warn' : 'info'](
    { service, status, ...metadata },
    message
  )
  await db.from('health_events').insert({ service, status, message, metadata }); // fire-and-forget
}

async function suppressDuplicateOk(service: string, message: string): Promise<boolean> {
  const { count } = await db
    .from('health_events')
    .select('*', { count: 'exact', head: true })
    .eq('service', service)
    .eq('status', 'ok')
    .ilike('message', `%${message.slice(0, 40)}%`)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
  return (count ?? 0) > 0
}

// ── 1. Railway service health + auto-redeploy ─────────────────────────────────

async function checkRailwayServices() {
  if (!RAILWAY_TOKEN) {
    log.warn('RAILWAY_TOKEN not set — skipping Railway checks')
    return
  }
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

      if (['CRASHED', 'FAILED'].includes(latest.status)) {
        await logEvent('railway', 'error', `${name} deployment ${latest.status} — attempting auto-redeploy`, { serviceId, deploymentId: latest.id })
        const lastGood = data.deployments.edges.find(e => e.node.status === 'SUCCESS')
        if (lastGood) {
          await railwayGql(`mutation($id: String!) { deploymentRedeploy(id: $id) { id status } }`, { id: lastGood.node.id })
          await logEvent('railway', 'auto_healed', `${name} redeployed from ${lastGood.node.id}`, { serviceId })
        } else {
          await logEvent('railway', 'warn', `${name} crashed but no prior SUCCESS deployment found — manual action needed`, { serviceId })
        }
      } else if (latest.status === 'SUCCESS') {
        if (!(await suppressDuplicateOk('railway', name))) {
          await logEvent('railway', 'ok', `${name} healthy`, { serviceId, deploymentId: latest.id })
        }
      }
    } catch (err) {
      await logEvent('railway', 'error', `Failed to check Railway service ${name}: ${(err as Error).message}`)
    }
  }
}

// ── 2. Web service HTTP health ────────────────────────────────────────────────

async function checkWebHttp() {
  const t0 = Date.now()
  try {
    const res = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(10_000) })
    const latencyMs = Date.now() - t0
    if (!res.ok) {
      await logEvent('web_http', 'error', `/api/health returned ${res.status}`, { status: res.status, latencyMs })
    } else if (latencyMs > 5000) {
      await logEvent('web_http', 'warn', `/api/health slow: ${latencyMs}ms`, { latencyMs })
    } else if (!(await suppressDuplicateOk('web_http', 'healthy'))) {
      await logEvent('web_http', 'ok', `Web HTTP healthy (${latencyMs}ms)`, { latencyMs })
    }
  } catch (err) {
    await logEvent('web_http', 'error', `Web HTTP unreachable: ${(err as Error).message}`, { latencyMs: Date.now() - t0 })
  }
}

// ── 3. Redis health ───────────────────────────────────────────────────────────

async function checkRedis() {
  const redis = getRedisConnection()
  const t0 = Date.now()
  try {
    const pong = await redis.ping()
    if (pong !== 'PONG') throw new Error(`Unexpected: ${pong}`)
    const latencyMs = Date.now() - t0
    const info = await redis.info('memory')
    const usedMem = info.match(/used_memory_human:(.+)/)?.[1]?.trim()
    const maxMem = info.match(/maxmemory_human:(.+)/)?.[1]?.trim()
    if (latencyMs > 500) {
      await logEvent('redis', 'warn', `Redis latency high: ${latencyMs}ms`, { latencyMs, usedMem })
    } else if (!(await suppressDuplicateOk('redis', 'healthy'))) {
      await logEvent('redis', 'ok', `Redis healthy (${latencyMs}ms, mem: ${usedMem})`, { latencyMs, usedMem, maxMem })
    }
  } catch (err) {
    await logEvent('redis', 'error', `Redis unreachable: ${(err as Error).message}`)
  }
}

// ── 4. BullMQ queue health ────────────────────────────────────────────────────

async function checkQueue() {
  const redis = getRedisConnection()
  const queue = new Queue('comment-replies', { connection: redis })
  try {
    const [waiting, active, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ])
    const stats = { waiting, active, failed, delayed }
    if (failed > 50)  await logEvent('queue', 'warn',  `High failed job count: ${failed}`, stats)
    if (waiting > 500) await logEvent('queue', 'warn', `Queue backlog: ${waiting} waiting`, stats)
    if (failed <= 50 && waiting <= 500 && !(await suppressDuplicateOk('queue', 'healthy'))) {
      await logEvent('queue', 'ok', `Queue healthy`, stats)
    }
  } catch (err) {
    await logEvent('queue', 'error', `Queue check failed: ${(err as Error).message}`)
  } finally {
    await queue.close()
  }
}

// ── 5. Supabase health + latency ──────────────────────────────────────────────

async function checkSupabase() {
  const t0 = Date.now()
  try {
    const { error } = await db.from('profiles').select('id').limit(1)
    if (error) throw new Error(error.message)
    const latencyMs = Date.now() - t0
    if (latencyMs > 3000) {
      await logEvent('supabase', 'warn', `Supabase slow: ${latencyMs}ms`, { latencyMs })
    } else if (!(await suppressDuplicateOk('supabase', 'healthy'))) {
      await logEvent('supabase', 'ok', `Supabase healthy (${latencyMs}ms)`, { latencyMs })
    }
  } catch (err) {
    await logEvent('supabase', 'error', `Supabase unreachable: ${(err as Error).message}`)
  }
}

// ── 6. Facebook Graph API reachability ───────────────────────────────────────

async function checkFacebookApi() {
  const t0 = Date.now()
  try {
    const res = await fetch('https://graph.facebook.com/v21.0/me?fields=id&access_token=invalid_test_token_healthcheck', {
      signal: AbortSignal.timeout(8_000),
    })
    const latencyMs = Date.now() - t0
    const data = await res.json() as { error?: { code: number; type: string } }
    // Code 190 = invalid token (expected) — API is reachable
    // Code >= 500 or network failure = real problem
    if (data.error?.code === 190 || data.error?.type === 'OAuthException') {
      if (!(await suppressDuplicateOk('facebook_api', 'reachable'))) {
        await logEvent('facebook_api', 'ok', `Facebook Graph API reachable (${latencyMs}ms)`, { latencyMs })
      }
    } else if (!res.ok && !data.error) {
      await logEvent('facebook_api', 'error', `Facebook Graph API returned ${res.status}`, { status: res.status, latencyMs })
    }
  } catch (err) {
    await logEvent('facebook_api', 'error', `Facebook Graph API unreachable: ${(err as Error).message}`)
  }
}

// ── 7. Webhook subscription status per page ───────────────────────────────────

async function checkWebhookSubscriptions() {
  try {
    const { data: pages } = await db
      .from('pages')
      .select('id, page_name, fb_page_id, agent_enabled, webhook_subscribed, access_token_enc, access_token_iv')
      .eq('agent_enabled', true)
      .eq('webhook_subscribed', false)

    if (pages && pages.length > 0) {
      const names = pages.map((p: { page_name: string }) => p.page_name).join(', ')
      await logEvent('webhooks', 'warn', `${pages.length} active page(s) have webhook_subscribed=false: ${names}`, {
        pages: pages.map((p: { id: string; page_name: string; fb_page_id: string }) => ({ id: p.id, name: p.page_name, fb_page_id: p.fb_page_id })),
      })
    }

    // Spot-check: verify the first enabled page's subscription is actually live on Facebook
    const { data: activePage } = await db
      .from('pages')
      .select('fb_page_id, page_name, access_token_enc, access_token_iv')
      .eq('agent_enabled', true)
      .eq('webhook_subscribed', true)
      .limit(1)
      .maybeSingle() as { data: { fb_page_id: string; page_name: string; access_token_enc: string; access_token_iv: string } | null }

    if (activePage?.access_token_enc) {
      const token = decrypt(activePage.access_token_enc, activePage.access_token_iv)
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${activePage.fb_page_id}/subscribed_apps`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }
      )
      const data = await res.json() as { data?: { subscribed_fields?: string[] }[] }
      const subscribed = data.data?.some(app => app.subscribed_fields?.includes('feed'))
      if (!subscribed) {
        await logEvent('webhooks', 'warn', `Page "${activePage.page_name}" has no active feed webhook subscription on Facebook`, {
          fb_page_id: activePage.fb_page_id,
        })
      }
    }
  } catch (err) {
    await logEvent('webhooks', 'error', `Webhook check failed: ${(err as Error).message}`)
  }
}

// ── 8. AI provider health (admin keys) ───────────────────────────────────────

async function checkAiProviders() {
  try {
    const { data: keys } = await db
      .from('ai_provider_keys')
      .select('id, provider, label, is_active, last_error_message, last_used_at, consecutive_errors')
      .eq('is_active', true)

    if (!keys?.length) return

    const nowBroken = keys.filter((k: { consecutive_errors: number; last_error_message: string | null }) => (k.consecutive_errors ?? 0) >= 3 && k.last_error_message)
    if (nowBroken.length > 0) {
      const labels = nowBroken.map((k: { label: string; provider: string }) => `${k.label} (${k.provider})`).join(', ')
      await logEvent('ai_providers', 'warn', `${nowBroken.length} AI key(s) have repeated errors: ${labels}`, {
        keys: nowBroken.map((k: { id: string; label: string; provider: string; last_error_message: string }) => ({ id: k.id, label: k.label, provider: k.provider, error: k.last_error_message })),
      })
    }

    const totalEnabled = keys.length
    const totalBroken = nowBroken.length
    if (totalBroken < totalEnabled && !(await suppressDuplicateOk('ai_providers', 'healthy'))) {
      await logEvent('ai_providers', 'ok', `${totalEnabled - totalBroken}/${totalEnabled} AI keys healthy`, { totalEnabled, totalBroken })
    }
    if (totalBroken === totalEnabled) {
      await logEvent('ai_providers', 'error', `ALL ${totalEnabled} AI keys are broken — no fallback available`, { keys: nowBroken })
    }
  } catch (err) {
    await logEvent('ai_providers', 'error', `AI provider check failed: ${(err as Error).message}`)
  }
}

// ── 9. Expiring Facebook page tokens ─────────────────────────────────────────

async function checkTokenExpiry() {
  try {
    const { data: pages } = await db
      .from('pages')
      .select('id, page_name, token_expires_at')
      .lt('token_expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
      .not('token_expires_at', 'is', null)

    if (pages && pages.length > 0) {
      const names = pages.map((p: { page_name: string }) => p.page_name).join(', ')
      await logEvent('tokens', 'warn', `${pages.length} page token(s) expire within 7 days: ${names}`, {
        pages: pages.map((p: { id: string; page_name: string; token_expires_at: string }) => ({ id: p.id, name: p.page_name, expires: p.token_expires_at })),
      })
    }
  } catch (_err) {
    // token_expires_at may not exist — skip
  }
}

// ── 10. Dead letter queue buildup ─────────────────────────────────────────────

async function checkDlq() {
  try {
    const { count } = await db
      .from('dead_letter_comments')
      .select('*', { count: 'exact', head: true })
      .is('resolved_at', null)

    if ((count ?? 0) > 20) {
      await logEvent('dlq', 'warn', `DLQ has ${count} unresolved failed comments`, { count })
    }
  } catch (err) {
    await logEvent('dlq', 'error', `DLQ check failed: ${(err as Error).message}`)
  }
}

// ── 11. Error spike detection ─────────────────────────────────────────────────

async function checkErrorSpike() {
  try {
    const { count } = await db
      .from('comments_log')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())

    if ((count ?? 0) > 10) {
      await logEvent('worker', 'warn', `Error spike: ${count} failed comments in last 15 min`, { count })
    }
  } catch (_err) {
    // ignore
  }
}

// ── 12. Handoff queue buildup ─────────────────────────────────────────────────

async function checkHandoffQueue() {
  try {
    const { count } = await db
      .from('handoff_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()) // pending > 2h

    if ((count ?? 0) > 0) {
      await logEvent('handoff', 'warn', `${count} handoff item(s) pending for over 2 hours — needs human attention`, { count })
    }
  } catch (err) {
    await logEvent('handoff', 'error', `Handoff check failed: ${(err as Error).message}`)
  }
}

// ── Purge old events ──────────────────────────────────────────────────────────

async function purgeOldEvents() {
  await db.from('health_events').delete()
    .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    ; // fire-and-forget
}

// ── Main loop ─────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 2 * 60 * 1000

async function runChecks() {
  log.info('--- health check run ---')
  await Promise.allSettled([
    checkWebHttp(),
    checkRedis(),
    checkQueue(),
    checkSupabase(),
    checkFacebookApi(),
    checkWebhookSubscriptions(),
    checkAiProviders(),
    checkTokenExpiry(),
    checkDlq(),
    checkErrorSpike(),
    checkHandoffQueue(),
  ])
  if (RAILWAY_TOKEN) await checkRailwayServices()
}

purgeOldEvents()
setInterval(() => purgeOldEvents(), 24 * 60 * 60 * 1000)

runChecks().catch(err => log.error({ err: err.message }, 'Initial health check failed'))
setInterval(() => {
  runChecks().catch(err => log.error({ err: err.message }, 'Health check run failed'))
}, CHECK_INTERVAL_MS)

log.info({ interval: `${CHECK_INTERVAL_MS / 1000}s`, checks: 12 }, 'Monitor service started')
