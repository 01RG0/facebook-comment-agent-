'use client'

import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import PagesList from '@/components/pages-list'
import ConnectFacebookBtn from '@/components/connect-facebook-btn'

const supabase = createClient()

interface Props { firstName: string }

export default function DashboardHome({ firstName }: Props) {
  const router = useRouter()
  const { data: pages, isLoading, mutate } = useSWR('/api/pages', { refreshInterval: 30_000 })

  // Live updates — pages list updates instantly when agent is toggled in any session
  useEffect(() => {
    const channel = supabase
      .channel('dashboard_pages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pages' }, () => { mutate() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [mutate])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    if (!isLoading && pages && pages.length === 0) {
      router.replace('/dashboard/onboarding')
    }
  }, [isLoading, pages, router])

  const activeCount = (pages ?? []).filter((p: any) => p.agent_enabled).length
  const totalCount = (pages ?? []).length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {greeting}, {firstName}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm flex items-center gap-2">
            <span>Manage your Facebook pages and agent settings</span>
            {!isLoading && (
              <>
                <span className="inline-block w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
                  {activeCount} of {totalCount} pages active
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center self-start sm:self-center">
          <ConnectFacebookBtn />
        </div>
      </div>

      <PagesList initialPages={pages ?? []} />
    </div>
  )
}
