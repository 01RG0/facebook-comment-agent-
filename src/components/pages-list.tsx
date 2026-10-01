'use client'

import { useState, useEffect, useRef } from 'react'
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
  const togglingRef = useRef<Record<string, boolean>>({})
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({})
  const [stats, setStats] = useState<Record<string, PageStats>>({})
  const [pageToDisconnect, setPageToDisconnect] = useState<Page | null>(null)
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({})
  const router = useRouter()

  // Sync when parent SWR data updates (e.g. Realtime refresh), but skip if toggle is in-flight
  useEffect(() => {
    const anyToggling = Object.values(togglingRef.current).some(Boolean)
    if (!anyToggling) setPages(initialPages)
  }, [initialPages])

  useEffect(() => {
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
            [page.id]: { todayReplies: todayCount, totalReplies: total, loading: false },
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
    // Optimistic flip — instant UI response
    setPages(ps => ps.map(p => p.id === pageId ? { ...p, agent_enabled: !currentEnabled } : p))
    togglingRef.current = { ...togglingRef.current, [pageId]: true }
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
      // Revert on error
      setPages(ps => ps.map(p => p.id === pageId ? { ...p, agent_enabled: currentEnabled } : p))
      toast.error(friendlyError(err))
    } finally {
      togglingRef.current = { ...togglingRef.current, [pageId]: false }
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
      <div className="grid grid-cols-1 gap-4 w-full">
        {pages.map(page => {
          const pageStat = stats[page.id]
          const totalReplies = pageStat?.loading ? '—' : String(pageStat?.totalReplies ?? 0)
          const todayReplies = pageStat?.loading ? '—' : String(pageStat?.todayReplies ?? 0)
          const connectedText = `Connected ${formatDistanceToNow(new Date(page.created_at), { addSuffix: true })}`

          return (
            <div
              key={page.id}
              className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all duration-200 border-l-4 ${
                page.agent_enabled
                  ? 'border-l-blue-600'
                  : 'border-l-gray-300 dark:border-l-gray-700'
              }`}
            >
              <div className="p-5 sm:p-6">
                {/* Top row: avatar + name + status + disconnect icon */}
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {page.page_picture_url && !imgErrors[page.id] ? (
                      <Image
                        src={page.page_picture_url}
                        alt={page.page_name}
                        width={52}
                        height={52}
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-gray-100 dark:ring-gray-800"
                        onError={() => setImgErrors(e => ({ ...e, [page.id]: true }))}
                        unoptimized
                      />
                    ) : (
                      <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center font-bold text-xl ring-2 ring-gray-100 dark:ring-gray-800">
                        {page.page_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Name + badge */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white truncate leading-tight">
                      {page.page_name}
                    </h3>
                    <div className="mt-1.5">
                      {page.webhook_subscribed ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 font-medium inline-flex items-center text-xs"
                        >
                          <span className="relative flex h-2 w-2 mr-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                          Live
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700/80 font-medium inline-flex items-center gap-1 text-xs"
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            Setup Required
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Toggle + disconnect */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Disconnect icon */}
                    <button
                      type="button"
                      onClick={() => setPageToDisconnect(page)}
                      disabled={disconnecting[page.id]}
                      title="Disconnect page"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition disabled:opacity-40"
                    >
                      <Unlink className="w-4 h-4" />
                    </button>

                    {/* Toggle */}
                    <div className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggle(page.id, page.agent_enabled)}
                        disabled={toggling[page.id]}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          page.agent_enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
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
                      <span className={`text-[10px] font-semibold leading-none ${
                        page.agent_enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'
                      }`}>
                        {page.agent_enabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center flex-wrap gap-6 gap-y-2 mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">{totalReplies}</p>
                    <p className="text-xs text-gray-400 mt-1">total replies</p>
                  </div>
                  <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">{todayReplies}</p>
                    <p className="text-xs text-gray-400 mt-1">today</p>
                  </div>
                  <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-400">{connectedText}</p>
                  </div>

                  {/* Action buttons — right-aligned */}
                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 h-8 px-3 text-xs"
                      onClick={() => router.push(`/dashboard/activity?page=${page.id}`)}
                    >
                      <BarChart2 className="w-3.5 h-3.5 mr-1" />
                      Activity
                    </Button>
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 text-xs"
                      onClick={() => router.push(`/dashboard/settings?page=${page.id}`)}
                    >
                      <Settings className="w-3.5 h-3.5 mr-1" />
                      Settings
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <AlertDialog
        open={Boolean(pageToDisconnect)}
        onOpenChange={open => { if (!open) setPageToDisconnect(null) }}
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
                if (pageToDisconnect) handleDisconnect(pageToDisconnect)
              }}
            >
              {pageToDisconnect && disconnecting[pageToDisconnect.id] ? 'Disconnecting...' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
