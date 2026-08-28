'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface Page {
  id: string
  fb_page_id: string
  page_name: string
  page_picture_url: string | null
  agent_enabled: boolean
  webhook_subscribed: boolean
  created_at: string
}

interface Props {
  initialPages: Page[]
}

export default function PagesList({ initialPages }: Props) {
  const [pages, setPages] = useState(initialPages)
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({})
  const router = useRouter()

  const handleToggle = async (pageId: string, currentEnabled: boolean) => {
    setToggling(t => ({ ...t, [pageId]: true }))
    try {
      const res = await fetch(`/api/pages/${pageId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const updated = await res.json()
      setPages(ps => ps.map(p => p.id === pageId ? { ...p, agent_enabled: updated.agent_enabled } : p))
      toast.success(updated.agent_enabled ? 'Agent enabled' : 'Agent paused')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setToggling(t => ({ ...t, [pageId]: false }))
    }
  }

  const handleDisconnect = async (pageId: string, pageName: string) => {
    if (!confirm(`Disconnect "${pageName}"? This will stop the agent and remove all settings.`)) return
    setDisconnecting(d => ({ ...d, [pageId]: true }))
    try {
      const res = await fetch('/api/facebook/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setPages(ps => ps.filter(p => p.id !== pageId))
      toast.success(`"${pageName}" disconnected`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDisconnecting(d => ({ ...d, [pageId]: false }))
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
      {pages.map(page => (
        <div
          key={page.id}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition"
        >
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {page.page_picture_url ? (
                <Image
                  src={page.page_picture_url}
                  alt={page.page_name}
                  width={48}
                  height={48}
                  className="rounded-full"
                />
              ) : (
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 dark:text-blue-400 font-bold text-lg">
                    {page.page_name[0]}
                  </span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                  {page.page_name}
                </h3>
                {page.webhook_subscribed ? (
                  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                    Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-2 py-0.5 rounded-full">
                    Not subscribed
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Connected {formatDistanceToNow(new Date(page.created_at), { addSuffix: true })}
              </p>
            </div>

            {/* Toggle */}
            <div className="flex-shrink-0">
              <button
                onClick={() => handleToggle(page.id, page.agent_enabled)}
                disabled={toggling[page.id]}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  page.agent_enabled
                    ? 'bg-blue-600'
                    : 'bg-gray-200 dark:bg-gray-700'
                } disabled:opacity-50`}
                title={page.agent_enabled ? 'Pause agent' : 'Enable agent'}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    page.agent_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <Link
              href={`/dashboard/activity?page=${page.id}`}
              className="flex-1 text-center text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              📊 Activity
            </Link>
            <Link
              href={`/dashboard/settings?page=${page.id}`}
              className="flex-1 text-center text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              ⚙️ Settings
            </Link>
            <button
              onClick={() => handleDisconnect(page.id, page.page_name)}
              disabled={disconnecting[page.id]}
              className="flex-1 text-center text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
            >
              {disconnecting[page.id] ? 'Removing...' : '🔌 Disconnect'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
