'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import ActivityLog from '@/components/activity-log'

const supabase = createClient()

interface Page { id: string; page_name: string; fb_page_id: string }

const STAT_COLORS = {
  Total: 'text-gray-900 dark:text-white',
  Replied: 'text-green-600 dark:text-green-400',
  Skipped: 'text-yellow-600 dark:text-yellow-400',
  Failed: 'text-red-600 dark:text-red-400',
}

export default function ActivityHome() {
  const searchParams = useSearchParams()

  const { data: pages = [] } = useSWR<Page[]>('/api/pages', { refreshInterval: 60_000 })

  const selectedPageId = searchParams.get('page') ?? pages[0]?.id ?? null

  const { data: stats, mutate: mutateStats } = useSWR(
    selectedPageId ? `/api/pages/${selectedPageId}/activity/stats` : null,
    { refreshInterval: 60_000 }
  )

  // Stats update instantly when a new comment is processed
  useEffect(() => {
    if (!selectedPageId) return
    const channel = supabase
      .channel(`activity_stats:${selectedPageId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments_log', filter: `page_id=eq.${selectedPageId}` }, () => { mutateStats() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedPageId, mutateStats])

  const statRows = stats ? [
    { label: 'Total', value: stats.total },
    { label: 'Replied', value: stats.replied },
    { label: 'Skipped', value: stats.skipped },
    { label: 'Failed', value: stats.failed },
  ] : null

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Comment reply history across your pages
        </p>
      </div>

      {selectedPageId && statRows && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {statRows.map(stat => (
            <div key={stat.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${STAT_COLORS[stat.label as keyof typeof STAT_COLORS]}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {selectedPageId && !statRows && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          ))}
        </div>
      )}

      <ActivityLog pages={pages} selectedPageId={selectedPageId} />
    </div>
  )
}
