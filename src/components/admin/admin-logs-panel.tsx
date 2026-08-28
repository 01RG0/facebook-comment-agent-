'use client'

import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { useSearchParams } from 'next/navigation'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface AiLog {
  id: string
  user_id: string
  page_id: string | null
  provider: string
  model: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  latency_ms: number | null
  success: boolean
  error_message: string | null
  created_at: string
  user_email: string | null
}

interface LogsResponse {
  logs: AiLog[]
  total: number
}

export default function AdminLogsPanel() {
  const searchParams = useSearchParams()
  const [provider, setProvider] = useState('')
  const [userId, setUserId] = useState(searchParams.get('user_id') ?? '')
  const [success, setSuccess] = useState('')
  const [page, setPage] = useState(0)
  const limit = 50

  const buildUrl = useCallback(() => {
    const p = new URLSearchParams()
    if (provider) p.set('provider', provider)
    if (userId) p.set('user_id', userId)
    if (success !== '') p.set('success', success)
    p.set('limit', limit.toString())
    p.set('offset', (page * limit).toString())
    return `/api/admin/logs?${p.toString()}`
  }, [provider, userId, success, page])

  const { data, isLoading } = useSWR<LogsResponse>(buildUrl(), fetcher, { refreshInterval: 15000 })

  const totalPages = Math.ceil((data?.total ?? 0) / limit)

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">AI Request Logs</h1>
        <p className="text-gray-400 mt-1 text-sm">Every AI request across all users — success and failure</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={userId}
          onChange={e => { setUserId(e.target.value); setPage(0) }}
          placeholder="Filter by user ID or email"
          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <input
          value={provider}
          onChange={e => { setProvider(e.target.value); setPage(0) }}
          placeholder="Filter by provider"
          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
        />
        <select
          value={success}
          onChange={e => { setSuccess(e.target.value); setPage(0) }}
          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All outcomes</option>
          <option value="true">Success only</option>
          <option value="false">Errors only</option>
        </select>
        {(userId || provider || success) && (
          <button
            onClick={() => { setUserId(''); setProvider(''); setSuccess(''); setPage(0) }}
            className="text-sm text-gray-500 hover:text-gray-300 transition"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-sm text-gray-500 self-center">
          {data?.total?.toLocaleString() ?? '—'} total
        </span>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">User</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Provider / Model</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Tokens</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Latency</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    <div className="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </td>
                </tr>
              ) : (data?.logs ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">No logs found</td>
                </tr>
              ) : (
                (data?.logs ?? []).map(log => (
                  <tr key={log.id} className="hover:bg-gray-800/30 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${log.success ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={`text-xs font-medium ${log.success ? 'text-green-400' : 'text-red-400'}`}>
                          {log.success ? 'OK' : 'Error'}
                        </span>
                      </div>
                      {log.error_message && (
                        <p className="text-xs text-red-400/70 mt-0.5 max-w-[160px] truncate" title={log.error_message}>
                          {log.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-300 text-xs">{log.user_email ?? log.user_id.slice(0, 8) + '…'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white">{log.provider}</span>
                      {log.model && <span className="text-gray-500 ml-1 text-xs">/ {log.model}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {log.total_tokens != null ? (
                        <div>
                          <span className="text-gray-300">{log.total_tokens.toLocaleString()}</span>
                          {log.prompt_tokens != null && log.completion_tokens != null && (
                            <span className="text-gray-600 text-xs ml-1">
                              ({log.prompt_tokens}↑ {log.completion_tokens}↓)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.latency_ms != null ? (
                        <span className={`text-xs ${log.latency_ms > 5000 ? 'text-yellow-400' : 'text-gray-400'}`}>
                          {log.latency_ms >= 1000 ? `${(log.latency_ms / 1000).toFixed(1)}s` : `${log.latency_ms}ms`}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white disabled:text-gray-700 transition rounded hover:bg-gray-800 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white disabled:text-gray-700 transition rounded hover:bg-gray-800 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
