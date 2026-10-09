'use client'

import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import AiSettingsForm from '@/components/ai-settings-form'
import TeamMembersPanel from '@/components/team-members-panel'
import KnowledgeBasePanel from '@/components/knowledge-base-panel'
import SchedulePanel from '@/components/schedule-panel'

interface Page { id: string; page_name: string }

export default function SettingsHome() {
  const searchParams = useSearchParams()

  const { data: pages = [], isLoading: pagesLoading } = useSWR<Page[]>('/api/pages', { refreshInterval: 60_000 })

  const selectedPageId = searchParams.get('page') ?? pages[0]?.id ?? null

  const { data: settings, isLoading: settingsLoading } = useSWR(
    selectedPageId ? `/api/pages/${selectedPageId}/settings` : null,
    { revalidateOnMount: true, refreshInterval: 60_000 }
  )

  const isLoading = pagesLoading || (!!selectedPageId && settingsLoading && !settings)

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Configure AI provider, reply behavior, filters, and team access per page
        </p>
      </div>

      {!pagesLoading && pages.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center text-gray-500 dark:text-gray-400">
          Connect a Facebook page first to configure settings.
        </div>
      ) : isLoading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        </div>
      ) : (
        <>
          <AiSettingsForm
            pages={pages}
            selectedPageId={selectedPageId}
            initialSettings={settings ?? null}
          />

          {selectedPageId && <SchedulePanel pageId={selectedPageId} initialSettings={settings ?? null} />}
          {selectedPageId && <KnowledgeBasePanel pageId={selectedPageId} />}
          {selectedPageId && <TeamMembersPanel pageId={selectedPageId} />}
        </>
      )}
    </div>
  )
}
