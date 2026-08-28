'use client'

import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'

const fetcher = (url: string) => fetch(url).then(r => r.json())

function StatCard({ label, value, sub, color = 'text-white' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminOverview() {
  const { data: stats, isLoading } = useSWR('/api/admin/stats', fetcher, { refreshInterval: 30000 })

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-gray-400 mt-1 text-sm">Real-time usage across all users</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats?.users?.total ?? 0} />
        <StatCard label="Total Pages" value={stats?.pages?.total ?? 0} />
        <StatCard label="Requests Today" value={stats?.today?.requests ?? 0} color="text-blue-400" />
        <StatCard label="Tokens Today" value={(stats?.today?.tokens ?? 0).toLocaleString()} color="text-purple-400" />
        <StatCard label="Requests This Month" value={(stats?.month?.requests ?? 0).toLocaleString()} />
        <StatCard label="Tokens This Month" value={(stats?.month?.tokens ?? 0).toLocaleString()} />
        <StatCard label="Total Errors" value={stats?.errors?.total ?? 0} color="text-red-400" />
        <StatCard label="Errors Today" value={stats?.today?.errors ?? 0} color={stats?.today?.errors > 0 ? 'text-red-400' : 'text-green-400'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Provider breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-4">Provider Usage</h2>
          {stats?.providers?.length === 0 ? (
            <p className="text-gray-500 text-sm">No data yet</p>
          ) : (
            <div className="space-y-2">
              {(stats?.providers ?? []).map((p: { name: string; count: number }) => {
                const total = stats.providers.reduce((s: number, x: any) => s + x.count, 0)
                const pct = total > 0 ? Math.round((p.count / total) * 100) : 0
                return (
                  <div key={p.name} className="flex items-center gap-3">
                    <div className="w-20 text-sm text-gray-300">{p.name}</div>
                    <div className="flex-1 bg-gray-800 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-16 text-right text-sm text-gray-400">{p.count.toLocaleString()}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent AI requests */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-4">Recent AI Requests</h2>
          <div className="space-y-2">
            {(stats?.recentLogs ?? []).map((log: any) => (
              <div key={log.id} className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${log.success ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm text-gray-300 truncate">{log.provider}/{log.model ?? 'default'}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-500">
                  {log.total_tokens && <span>{log.total_tokens.toLocaleString()} tokens</span>}
                  {log.latency_ms && <span>{log.latency_ms}ms</span>}
                  <span>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            ))}
            {!stats?.recentLogs?.length && <p className="text-gray-500 text-sm">No requests yet</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
