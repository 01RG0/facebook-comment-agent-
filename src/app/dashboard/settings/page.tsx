import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import AiSettingsForm from '@/components/ai-settings-form'
import TeamMembersPanel from '@/components/team-members-panel'
import KnowledgeBasePanel from '@/components/knowledge-base-panel'

export const metadata: Metadata = { title: 'Settings' }

interface Props {
  searchParams: { page?: string }
}

export default async function SettingsPage({ searchParams }: Props) {
  const supabase = createClient()

  const { data: pages } = await supabase
    .from('pages')
    .select('id, page_name')
    .order('created_at', { ascending: false })

  const selectedPageId = searchParams.page ?? pages?.[0]?.id ?? null

  let settings = null
  if (selectedPageId) {
    const { data } = await supabase
      .from('settings')
      .select(`
        id, ai_provider, ai_model, custom_base_url, ai_api_key_enc,
        preferred_ai_key_ids,
        reply_instructions, reply_language, reply_delay_seconds,
        max_replies_per_hour, keyword_filter, blacklisted_user_ids,
        reply_to_own_posts_only, reply_tone, reply_length,
        reply_blacklist_words, review_mode_enabled, auto_retry_enabled,
        max_retry_attempts, human_handoff_enabled, human_handoff_keywords
      `)
      .eq('page_id', selectedPageId)
      .single()
    settings = data
  }

  const { data: handoffItems } = selectedPageId
    ? await supabase
        .from('handoff_queue')
        .select('id, commenter_name, comment_text, ai_draft, status, created_at')
        .eq('page_id', selectedPageId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20)
    : { data: null }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Configure AI provider, reply behavior, filters, and team access per page
        </p>
      </div>

      {!pages || pages.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center text-gray-500 dark:text-gray-400">
          Connect a Facebook page first to configure settings.
        </div>
      ) : (
        <>
          <AiSettingsForm
            pages={pages}
            selectedPageId={selectedPageId}
            initialSettings={settings ? {
              ...settings,
              has_custom_api_key: !!(settings.ai_api_key_enc),
            } : null}
            handoffItems={handoffItems ?? []}
          />

          {selectedPageId && (
            <KnowledgeBasePanel pageId={selectedPageId} />
          )}

          {selectedPageId && (
            <TeamMembersPanel pageId={selectedPageId} />
          )}
        </>
      )}
    </div>
  )
}
