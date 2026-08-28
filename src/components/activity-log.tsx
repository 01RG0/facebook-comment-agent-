'use client'

import { useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import useSWR from 'swr'
import { formatDistanceToNow, format } from 'date-fns'

interface Page { id: string; page_name: string; fb_page_id: string }

interface CommentLog {
  id: string
  commenter_name: string
  commenter_id: string
  comment_text: string
  reply_text: string | null
  status: 'pending' | 'replied' | 'skipped' | 'failed' | 'manual'
  skip_reason: string | null
  ai_provider: string | null
  ai_model: string | null
  error_message: string | null
  replied_at: string | null
  created_at: string
}

interface Props {
  pages: Page[]
  selectedPageId: string | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

const statusStyles: Record<string, string> = {
  replied: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  skipped: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  manual: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
}

export default function ActivityLog({ pages, selectedPageId }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const pageId = selectedPageId
  const url = pageId
    ? `/api/pages/${pageId}/activity?limit=50${statusFilter ? `&status=${statusFilter}` : ''}`
    : null

  const { data, isLoading } = useSWR(url, fetcher, { refreshInterval: 15000 })

  const handlePageChange = (id: string) => {
    router.push(`${pathname}?page=${id}`)
  }

  if (pages.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No pages connected. Connect a Facebook page to see activity.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {pages.length > 1 && (
          <select
            value={selectedPageId ?? ''}
            onChange={e => handlePageChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {pages.map(p => (
              <option key={p.id} value={p.id}>{p.page_name}</option>
            ))}
          </select>
        )}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          <option value="replied">Replied</option>
          <option value="skipped">Skipped</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : !data?.data || data.data.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No activity yet for this page.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.data.map((log: CommentLog) => (
              <div key={log.id}>
                <button
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="w-full text-left px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
                      {log.commenter_name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {log.commenter_name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyles[log.status]}`}>
                          {log.status}
                        </span>
                        {log.skip_reason && (
                          <span className="text-xs text-gray-400">({log.skip_reason})</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {log.comment_text}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </button>

                {expandedId === log.id && (
                  <div className="px-5 pb-4 bg-gray-50 dark:bg-gray-800/30 space-y-3 text-sm">
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Comment</p>
                      <p className="text-gray-800 dark:text-gray-200">{log.comment_text}</p>
                    </div>
                    {log.reply_text && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Reply</p>
                        <p className="text-gray-800 dark:text-gray-200">{log.reply_text}</p>
                        {log.ai_provider && (
                          <p className="text-xs text-gray-400 mt-1">
                            {log.ai_provider}{log.ai_model ? ` / ${log.ai_model}` : ''} •{' '}
                            {log.replied_at ? format(new Date(log.replied_at), 'PPp') : ''}
                          </p>
                        )}
                      </div>
                    )}
                    {log.error_message && (
                      <div>
                        <p className="text-xs font-medium text-red-500 uppercase tracking-wide mb-1">Error</p>
                        <p className="text-red-600 dark:text-red-400 font-mono text-xs">{log.error_message}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {data?.count > 50 && (
          <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/30 text-center text-xs text-gray-500 dark:text-gray-400">
            Showing 50 of {data.count} entries
          </div>
        )}
      </div>
    </div>
  )
}
