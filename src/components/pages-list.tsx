'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { BarChart2, Settings, Unlink, AlertTriangle } from 'lucide-react'
import { friendlyError } from '@/lib/friendly-errors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

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

interface PageStats {
  todayReplies: number
  totalReplies: number
  loading: boolean
}

export default function PagesList({ initialPages }: Props) {
  const [pages, setPages] = useState<Page[]>(initialPages)
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({})
  const [stats, setStats] = useState<Record<string, PageStats>>({})
  const [pageToDisconnect, setPageToDisconnect] = useState<Page | null>(null)
  const router = useRouter()

  useEffect(() => {
    // Fetch stats for each page
    pages.forEach(page => {
      setStats(prev => ({
        ...prev,
        [page.id]: { todayReplies: 0, totalReplies: 0, loading: true },
      }))

      fetch(`/api/pages/${page.id}/activity?limit=1`)
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (!data) return
          const total = typeof data.count === 'number' ? data.count : 0
          // Estimate/check today's replies from activity if available
          let todayCount = 0
          if (Array.isArray(data.data)) {
            const startOfToday = new Date()
            startOfToday.setHours(0, 0, 0, 0)
            todayCount = data.data.filter(
              (item: { created_at?: string }) =>
                item.created_at && new Date(item.created_at) >= startOfToday
            ).length
          }

          setStats(prev => ({
            ...prev,
            [page.id]: {
              todayReplies: todayCount,
              totalReplies: total,
              loading: false,
            },
          }))
        })
        .catch(() => {
          setStats(prev => ({
            ...prev,
            [page.id]: { todayReplies: 0, totalReplies: 0, loading: false },
          }))
        })
    })
  }, [pages])

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
      setPages(ps =>
        ps.map(p =>
          p.id === pageId ? { ...p, agent_enabled: updated.agent_enabled } : p
        )
      )
      toast.success(updated.agent_enabled ? 'Agent enabled' : 'Agent paused')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setToggling(t => ({ ...t, [pageId]: false }))
    }
  }

  const handleDisconnect = async (page: Page) => {
    const pageId = page.id
    const pageName = page.page_name
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
      toast.error(friendlyError(err))
    } finally {
      setDisconnecting(d => ({ ...d, [pageId]: false }))
      setPageToDisconnect(null)
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 w-full">
        {pages.map(page => {
          const pageStat = stats[page.id]
          const totalText = pageStat?.loading ? '...' : `${pageStat?.totalReplies ?? 0} total`
          const todayText = pageStat?.loading ? '...' : `${pageStat?.todayReplies ?? 0} replies today`
          const connectedText = `Connected ${formatDistanceToNow(new Date(page.created_at), { addSuffix: true })}`

          return (
            <div
              key={page.id}
              className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-shadow border-l-4 ${
                page.agent_enabled
                  ? 'border-l-blue-600'
                  : 'border-l-gray-300 dark:border-l-gray-700'
              }`}
            >
              {/* TOP SECTION */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Page Avatar */}
                  <div className="flex-shrink-0">
                    {page.page_picture_url ? (
                      <Image
                        src={page.page_picture_url}
                        alt={page.page_name}
                        width={56}
                        height={56}
                        className="w-14 h-14 rounded-full object-cover ring-2 ring-gray-100 dark:ring-gray-800"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center font-bold text-xl ring-2 ring-gray-100 dark:ring-gray-800">
                        {page.page_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Page Name & Webhook Status */}
                  <div className="min-w-0 flex flex-col items-start gap-1">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-full">
                      {page.page_name}
                    </h3>
                    <div>
                      {page.webhook_subscribed ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 font-medium inline-flex items-center"
                        >
                          <span className="relative flex h-2 w-2 mr-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                          Live
                        </Badge>
                      ) : (
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            variant="outline"
                            title="Webhook not connected — comments won't be received"
                            className="bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700/80 font-medium inline-flex items-center gap-1.5 px-2 py-0.5"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>Setup Required</span>
                          </Badge>
                          <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90 font-medium leading-tight">
                            Webhook not connected — comments won&apos;t be received
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Agent ON/OFF Toggle */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggle(page.id, page.agent_enabled)}
                    disabled={toggling[page.id]}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      page.agent_enabled
                        ? 'bg-blue-600'
                        : 'bg-gray-200 dark:bg-gray-700'
                    } disabled:opacity-50 cursor-pointer`}
                    title={page.agent_enabled ? 'Pause agent' : 'Enable agent'}
                    aria-label={page.agent_enabled ? 'Pause agent' : 'Enable agent'}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                        page.agent_enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span
                    className={`text-xs font-semibold ${
                      page.agent_enabled
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {page.agent_enabled ? 'Agent Active' : 'Agent Paused'}
                  </span>
                </div>
              </div>

              {/* MIDDLE SECTION: 3 mini stat chips */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4">
                <div className="bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800/80 text-center flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">
                    {todayText}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800/80 text-center flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">
                    {totalText}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800/80 text-center flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">
                    {connectedText}
                  </p>
                </div>
              </div>

              {/* BOTTOM SECTION: 3 action buttons */}
              <div className="flex items-center gap-2.5 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <Button
                  variant="outline"
                  className="flex-1 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => router.push(`/dashboard/activity?page=${page.id}`)}
                >
                  <BarChart2 className="w-4 h-4 mr-1.5" />
                  Activity
                </Button>

                <Button
                  variant="outline"
                  className="flex-1 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => router.push(`/dashboard/settings?page=${page.id}`)}
                >
                  <Settings className="w-4 h-4 mr-1.5" />
                  Settings
                </Button>

                <Button
                  variant="outline"
                  className="flex-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:hover:bg-red-950/30"
                  onClick={() => setPageToDisconnect(page)}
                  disabled={disconnecting[page.id]}
                >
                  <Unlink className="w-4 h-4 mr-1.5" />
                  {disconnecting[page.id] ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Disconnect confirmation dialog */}
      <AlertDialog
        open={Boolean(pageToDisconnect)}
        onOpenChange={open => {
          if (!open) setPageToDisconnect(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect page?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop the agent and remove all settings and webhooks for{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {pageToDisconnect?.page_name}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pageToDisconnect ? disconnecting[pageToDisconnect.id] : false}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white focus:ring-red-600"
              disabled={pageToDisconnect ? disconnecting[pageToDisconnect.id] : false}
              onClick={e => {
                e.preventDefault()
                if (pageToDisconnect) {
                  handleDisconnect(pageToDisconnect)
                }
              }}
            >
              {pageToDisconnect && disconnecting[pageToDisconnect.id]
                ? 'Disconnecting...'
                : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
