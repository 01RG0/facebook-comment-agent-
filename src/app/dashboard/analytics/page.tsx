'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface DailyStat {
  date: string
  replied: number
  skipped: number
  failed: number
}

interface PageStat {
  page_name: string
  replied: number
  failed: number
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState({ total: 0, replied: 0, skipped: 0, failed: 0 })
  const [daily, setDaily] = useState<DailyStat[]>([])
  const [byPage, setByPage] = useState<PageStat[]>([])
  const [failures, setFailures] = useState<{ id: string; commenter_name: string; comment_text: string; error_message: string; created_at: string; page_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(7)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const since = new Date(Date.now() - range * 86400000).toISOString()

      const { data: logs } = await supabase
        .from('comments_log')
        .select('status, created_at, page_id, error_message, commenter_name, comment_text, id, pages(page_name)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })

      if (!logs) { setLoading(false); return }

      const total = logs.length
      const replied = logs.filter(l => l.status === 'replied').length
      const skipped = logs.filter(l => l.status === 'skipped').length
      const failed = logs.filter(l => l.status === 'failed').length
      setSummary({ total, replied, skipped, failed })

      // daily breakdown
      const byDay: Record<string, DailyStat> = {}
      for (const log of logs) {
        const day = log.created_at.slice(0, 10)
        if (!byDay[day]) byDay[day] = { date: day, replied: 0, skipped: 0, failed: 0 }
        if (log.status === 'replied') byDay[day].replied++
        else if (log.status === 'skipped') byDay[day].skipped++
        else if (log.status === 'failed') byDay[day].failed++
      }
      setDaily(Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)))

      // by page
      const pageMap: Record<string, { replied: number; failed: number; name: string }> = {}
      for (const log of logs) {
        const name = (log.pages as unknown as { page_name: string } | null)?.page_name ?? 'Unknown'
        if (!pageMap[log.page_id]) pageMap[log.page_id] = { replied: 0, failed: 0, name }
        if (log.status === 'replied') pageMap[log.page_id].replied++
        if (log.status === 'failed') pageMap[log.page_id].failed++
      }
      setByPage(Object.values(pageMap).map(p => ({ page_name: p.name, replied: p.replied, failed: p.failed })))

      // recent failures
      setFailures(
        logs
          .filter(l => l.status === 'failed')
          .slice(0, 10)
          .map(l => ({
            id: l.id,
            commenter_name: l.commenter_name,
            comment_text: l.comment_text,
            error_message: l.error_message ?? '',
            created_at: l.created_at,
            page_name: (l.pages as unknown as { page_name: string } | null)?.page_name ?? 'Unknown',
          }))
      )

      setLoading(false)
    }
    load()
  }, [range])

  const maxBar = Math.max(...daily.map(d => d.replied + d.skipped + d.failed), 1)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Comment processing statistics</p>
        </div>
        <select
          value={range}
          onChange={e => setRange(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total', value: summary.total, color: 'text-gray-900 dark:text-white', bg: 'bg-white dark:bg-gray-900' },
              { label: 'Replied', value: summary.replied, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
              { label: 'Skipped', value: summary.skipped, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
              { label: 'Failed', value: summary.failed, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
            ].map(card => (
              <div key={card.label} className={`${card.bg} rounded-xl border border-gray-200 dark:border-gray-800 p-5`}>
                <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Daily bar chart */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Daily Activity</h2>
            {daily.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No data in this period</p>
            ) : (
              <div className="flex items-end gap-2 h-40">
                {daily.map(d => {
                  const total = d.replied + d.skipped + d.failed
                  const height = Math.max((total / maxBar) * 100, 2)
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute bottom-8 hidden group-hover:flex flex-col items-center bg-gray-800 text-white text-xs rounded px-2 py-1 z-10 whitespace-nowrap shadow-lg">
                        <span>{d.date}</span>
                        <span className="text-green-400">{d.replied} replied</span>
                        <span className="text-yellow-400">{d.skipped} skipped</span>
                        <span className="text-red-400">{d.failed} failed</span>
                      </div>
                      <div className="w-full rounded-t" style={{ height: `${height}%`, background: 'linear-gradient(to top, #ef4444 0%, #f59e0b 40%, #22c55e 70%)' }} />
                      <span className="text-xs text-gray-400 truncate w-full text-center">{d.date.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex gap-4 mt-3 text-xs">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Replied</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />Skipped</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Failed</span>
            </div>
          </div>

          {/* By Page */}
          {byPage.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">By Page</h2>
              <div className="space-y-3">
                {byPage.map(p => (
                  <div key={p.page_name} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{p.page_name}</span>
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-600">{p.replied} replied</span>
                      <span className="text-red-500">{p.failed} failed</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Failures */}
          {failures.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Recent Failures</h2>
              <div className="overflow-x-auto">
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
                      <tr key={f.id}>
                        <td className="py-2 pr-4 font-medium text-gray-900 dark:text-white truncate max-w-[120px]">{f.commenter_name}</td>
                        <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 truncate max-w-[180px]">{f.comment_text}</td>
                        <td className="py-2 pr-4 text-red-500 text-xs truncate max-w-[200px]">{f.error_message}</td>
                        <td className="py-2 pr-4 text-gray-500 text-xs">{f.page_name}</td>
                        <td className="py-2 text-gray-400 text-xs whitespace-nowrap">{new Date(f.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
