import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import ActivityLog from '@/components/activity-log'

export const metadata: Metadata = { title: 'Activity' }

interface Props {
  searchParams: { page?: string }
}

export default async function ActivityPage({ searchParams }: Props) {
  const supabase = createClient()

  const { data: pages } = await supabase
    .from('pages')
    .select('id, page_name, fb_page_id')
    .order('created_at', { ascending: false })

  const selectedPageId = searchParams.page ?? pages?.[0]?.id ?? null

  let stats = { replied: 0, skipped: 0, failed: 0, total: 0 }
  if (selectedPageId) {
    const { data: counts } = await supabase
      .from('comments_log')
      .select('status')
      .eq('page_id', selectedPageId)

    if (counts) {
      stats.total = counts.length
      counts.forEach(r => {
        if (r.status === 'replied') stats.replied++
        if (r.status === 'skipped') stats.skipped++
        if (r.status === 'failed') stats.failed++
      })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Comment reply history across your pages
        </p>
      </div>

      {/* Stats Row */}
      {selectedPageId && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-900 dark:text-white' },
            { label: 'Replied', value: stats.replied, color: 'text-green-600 dark:text-green-400' },
            { label: 'Skipped', value: stats.skipped, color: 'text-yellow-600 dark:text-yellow-400' },
            { label: 'Failed', value: stats.failed, color: 'text-red-600 dark:text-red-400' },
          ].map(stat => (
            <div key={stat.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      <ActivityLog pages={pages ?? []} selectedPageId={selectedPageId} />
    </div>
  )
}
