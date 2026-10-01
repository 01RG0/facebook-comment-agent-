'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/friendly-errors'
import {
  TrendingUp, TrendingDown, MessageSquare, CheckCircle2,
  XCircle, Clock, BarChart3, Minus
} from 'lucide-react'

interface DailyStat {
  date: string
  replied: number
  skipped: number
  failed: number
}

interface PageStat {
  page_id: string
  page_name: string
  replied: number
  skipped: number
  failed: number
}

interface Failure {
  id: string
  commenter_name: string
  comment_text: string
  error_message: string
  created_at: string
  page_name: string
  page_id: string
}

interface PageOption { id: string; page_name: string }

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-800 rounded-lg ${className ?? ''}`} />
}

function TrendBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0 && current === 0) return null
  const pct = previous === 0 ? 100 : Math.round(((current - previous) / previous) * 100)
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${up ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct)}%
    </span>
  )
}

interface TooltipData { x: number; y: number; date: string; replied: number; skipped: number; failed: number }

function StackedBarChart({ daily }: { daily: DailyStat[] }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const maxVal = Math.max(...daily.map(d => d.replied + d.skipped + d.failed), 1)
  const W = 600; const H = 200; const PL = 40; const PB = 28; const PT = 10; const PR = 10
  const chartW = W - PL - PR; const chartH = H - PB - PT
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="relative w-full overflow-x-auto">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 300 }}>
        {/* grid lines */}
        {ticks.map(t => {
          const y = PT + chartH * (1 - t)
          return (
            <g key={t}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} strokeDasharray="4 4" />
              <text x={PL - 6} y={y + 4} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.4}>
                {Math.round(t * maxVal)}
              </text>
            </g>
          )
        })}

        {/* bars */}
        {daily.map((d, i) => {
          const bw = Math.max((chartW / daily.length) - 4, 4)
          const x = PL + (i / daily.length) * chartW + (chartW / daily.length - bw) / 2
          const total = d.replied + d.skipped + d.failed
          const repliedH = (d.replied / maxVal) * chartH
          const skippedH = (d.skipped / maxVal) * chartH
          const failedH = (d.failed / maxVal) * chartH
          const base = PT + chartH

          return (
            <g key={d.date}
              onMouseEnter={e => {
                const rect = svgRef.current?.getBoundingClientRect()
                if (!rect) return
                const cx = rect.left + (x + bw / 2) / W * rect.width
                const cy = rect.top
                setTooltip({ x: cx - rect.left, y: cy - rect.top - 10, date: d.date, replied: d.replied, skipped: d.skipped, failed: d.failed })
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'default' }}
            >
              {/* replied (bottom of stack) */}
              {repliedH > 0 && <rect x={x} y={base - repliedH} width={bw} height={repliedH} fill="#22c55e" rx={total === d.replied ? 3 : 0} />}
              {/* skipped */}
              {skippedH > 0 && <rect x={x} y={base - repliedH - skippedH} width={bw} height={skippedH} fill="#f59e0b" rx={total === d.skipped ? 3 : 0} />}
              {/* failed (top) */}
              {failedH > 0 && <rect x={x} y={base - repliedH - skippedH - failedH} width={bw} height={failedH} fill="#ef4444" rx={3} />}
              {/* hover zone */}
              <rect x={x} y={PT} width={bw} height={chartH} fill="transparent" />
              {/* x label */}
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.45}>
                {d.date.slice(5).replace('-', '/')}
              </text>
            </g>
          )
        })}
      </svg>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 shadow-xl"
          style={{ left: tooltip.x, top: -80, transform: 'translateX(-50%)' }}
        >
          <div className="font-semibold mb-1">{tooltip.date}</div>
          <div className="flex flex-col gap-0.5">
            <span className="text-green-400">{tooltip.replied} replied</span>
            <span className="text-amber-400">{tooltip.skipped} skipped</span>
            <span className="text-red-400">{tooltip.failed} failed</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AnalyticsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [dmThreads, setDmThreads] = useState<any[]>([])
  const [pages, setPages] = useState<PageOption[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(7)
  const [pageFilter, setPageFilter] = useState('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const since = new Date(Date.now() - range * 86400000).toISOString()

      const [logsRes, dmRes, pagesRes] = await Promise.all([
        supabase
          .from('comments_log')
          .select('status, created_at, page_id, error_message, commenter_name, comment_text, id, pages(page_name)')
          .gte('created_at', since)
          .order('created_at', { ascending: false }),
        supabase.from('messenger_threads').select('status, created_at').gte('created_at', since),
        supabase.from('pages').select('id, page_name'),
      ])

      setLogs(logsRes.data ?? [])
      setDmThreads(dmRes.data ?? [])
      setPages(pagesRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [range])

  const filtered = pageFilter === 'all' ? logs : logs.filter(l => l.page_id === pageFilter)

  const total = filtered.length
  const replied = filtered.filter(l => l.status === 'replied').length
  const skipped = filtered.filter(l => l.status === 'skipped').length
  const failed = filtered.filter(l => l.status === 'failed').length

  // trend: compare first half vs second half
  const mid = new Date(Date.now() - (range / 2) * 86400000).toISOString()
  const firstHalf = filtered.filter(l => l.created_at < mid)
  const secondHalf = filtered.filter(l => l.created_at >= mid)
  const trend = (arr: any[], status: string) => arr.filter(l => l.status === status).length

  // daily
  const byDay: Record<string, DailyStat> = {}
  for (const log of filtered) {
    const day = log.created_at.slice(0, 10)
    if (!byDay[day]) byDay[day] = { date: day, replied: 0, skipped: 0, failed: 0 }
    if (log.status === 'replied') byDay[day].replied++
    else if (log.status === 'skipped') byDay[day].skipped++
    else if (log.status === 'failed') byDay[day].failed++
  }
  const daily = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date))

  // by page
  const pageMap: Record<string, PageStat> = {}
  for (const log of filtered) {
    const name = (log.pages as any)?.page_name ?? 'Unknown'
    if (!pageMap[log.page_id]) pageMap[log.page_id] = { page_id: log.page_id, page_name: name, replied: 0, skipped: 0, failed: 0 }
    if (log.status === 'replied') pageMap[log.page_id].replied++
    else if (log.status === 'skipped') pageMap[log.page_id].skipped++
    else if (log.status === 'failed') pageMap[log.page_id].failed++
  }
  const byPage = Object.values(pageMap)

  const failures: Failure[] = filtered
    .filter(l => l.status === 'failed')
    .slice(0, 10)
    .map(l => ({
      id: l.id,
      commenter_name: l.commenter_name,
      comment_text: l.comment_text,
      error_message: l.error_message ?? '',
      created_at: l.created_at,
      page_name: (l.pages as any)?.page_name ?? 'Unknown',
      page_id: l.page_id,
    }))

  const dmTotal = dmThreads.length
  const dmOpen = dmThreads.filter(t => t.status === 'open' || t.status === 'in_progress').length
  const dmResolved = dmThreads.filter(t => t.status === 'resolved').length

  const statCards = [
    {
      label: 'Total Comments',
      value: total,
      icon: <BarChart3 className="w-5 h-5" />,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      iconBg: 'bg-blue-100 dark:bg-blue-900/40',
      badge: null,
      prev: firstHalf.length,
      curr: secondHalf.length,
    },
    {
      label: 'Replied',
      value: replied,
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-900/20',
      iconBg: 'bg-green-100 dark:bg-green-900/40',
      badge: total > 0 ? `${Math.round((replied / total) * 100)}% reply rate` : null,
      prev: trend(firstHalf, 'replied'),
      curr: trend(secondHalf, 'replied'),
    },
    {
      label: 'Skipped',
      value: skipped,
      icon: <Minus className="w-5 h-5" />,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      iconBg: 'bg-amber-100 dark:bg-amber-900/40',
      badge: total > 0 ? `${Math.round((skipped / total) * 100)}% skip rate` : null,
      prev: trend(firstHalf, 'skipped'),
      curr: trend(secondHalf, 'skipped'),
    },
    {
      label: 'Failed',
      value: failed,
      icon: <XCircle className="w-5 h-5" />,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
      iconBg: 'bg-red-100 dark:bg-red-900/40',
      badge: total > 0 && failed > 0 ? `${Math.round((failed / total) * 100)}% error rate` : null,
      prev: trend(firstHalf, 'failed'),
      curr: trend(secondHalf, 'failed'),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-sm">Comment processing statistics</p>
        </div>
        <div className="flex items-center gap-2">
          {pages.length > 1 && (
            <select value={pageFilter} onChange={e => setPageFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Pages</option>
              {pages.map(p => <option key={p.id} value={p.id}>{p.page_name}</option>)}
            </select>
          )}
          <select value={range} onChange={e => setRange(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-56" />
          <Skeleton className="h-36" />
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {statCards.map(card => (
              <div key={card.label} className={`${card.bg} rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col gap-3`}>
                <div className="flex items-center justify-between">
                  <div className={`${card.iconBg} p-2 rounded-lg ${card.color}`}>{card.icon}</div>
                  <TrendBadge current={card.curr} previous={card.prev} label={card.label} />
                </div>
                <div>
                  <p className={`text-3xl font-bold ${card.color}`}>{card.value.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{card.label}</p>
                </div>
                {card.badge && (
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.badge}</span>
                )}
              </div>
            ))}
          </div>

          {/* DM Stats */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-blue-500" />
              <h2 className="font-semibold text-sm text-gray-900 dark:text-white">Messenger DMs</h2>
              <span className="text-xs text-gray-400">· same period</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Total threads', value: dmTotal, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' },
                { label: 'Open / In progress', value: dmOpen, color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' },
                { label: 'Resolved', value: dmResolved, color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' },
              ].map(d => (
                <div key={d.label} className={`${d.color} px-4 py-2 rounded-lg flex items-center gap-2`}>
                  <span className="text-xl font-bold">{d.value}</span>
                  <span className="text-xs font-medium">{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Chart */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Daily Activity</h2>
            {daily.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No data in this period</p>
            ) : (
              <StackedBarChart daily={daily} />
            )}
            <div className="flex gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />Replied</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />Skipped</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />Failed</span>
            </div>
          </div>

          {/* By Page */}
          {byPage.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">By Page</h2>
              <div className="space-y-4">
                {byPage.map(p => {
                  const pageTotal = p.replied + p.skipped + p.failed
                  const replyRate = pageTotal > 0 ? Math.round((p.replied / pageTotal) * 100) : 0
                  return (
                    <div key={p.page_id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{p.page_name}</span>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span className="text-green-600 dark:text-green-400 font-medium">{p.replied} replied</span>
                          {p.failed > 0 && <span className="text-red-500 font-medium">{p.failed} failed</span>}
                          <span className="font-semibold text-gray-700 dark:text-gray-300">{replyRate}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full flex">
                          <div className="bg-green-500 transition-all" style={{ width: `${replyRate}%` }} />
                          {p.skipped > 0 && <div className="bg-amber-400 transition-all" style={{ width: `${Math.round((p.skipped / pageTotal) * 100)}%` }} />}
                          {p.failed > 0 && <div className="bg-red-500 transition-all" style={{ width: `${Math.round((p.failed / pageTotal) * 100)}%` }} />}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent Failures */}
          {failures.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Recent Failures</h2>

              {/* Mobile: cards */}
              <div className="sm:hidden space-y-3">
                {failures.map(f => (
                  <div key={f.id} className="flex gap-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg">
                    <div className="w-9 h-9 rounded-full bg-red-200 dark:bg-red-800 flex items-center justify-center text-xs font-bold text-red-700 dark:text-red-300 shrink-0">
                      {initials(f.commenter_name || '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{f.commenter_name}</span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(f.created_at)}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">"{f.comment_text}"</p>
                      <span className="mt-1 inline-flex items-center gap-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full">
                        <XCircle className="w-3 h-3" />
                        {friendlyError(f.error_message).slice(0, 60)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                      <th className="pb-2 pr-4">Commenter</th>
                      <th className="pb-2 pr-4">Comment</th>
                      <th className="pb-2 pr-4">Error</th>
                      <th className="pb-2 pr-4">Page</th>
                      <th className="pb-2">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {failures.map(f => (
                      <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-xs font-bold text-red-700 dark:text-red-400 shrink-0">
                              {initials(f.commenter_name || '?')}
                            </div>
                            <span className="font-medium text-gray-900 dark:text-white truncate max-w-[100px]">{f.commenter_name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-gray-500 dark:text-gray-400 truncate max-w-[160px] text-xs">"{f.comment_text}"</td>
                        <td className="py-2.5 pr-4">
                          <span className="inline-flex items-center gap-1 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full max-w-[180px] truncate">
                            {friendlyError(f.error_message)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-gray-500 dark:text-gray-400 text-xs">{f.page_name}</td>
                        <td className="py-2.5 text-gray-400 text-xs whitespace-nowrap">
                          <span title={new Date(f.created_at).toLocaleString()}>{timeAgo(f.created_at)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {total === 0 && (
            <div className="text-center py-16 text-gray-400 dark:text-gray-600">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No activity in this period</p>
              <p className="text-sm mt-1">Data will appear here once comments start coming in.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
