import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PagesList from '@/components/pages-list'
import ConnectFacebookBtn from '@/components/connect-facebook-btn'

export const metadata: Metadata = { title: 'Pages' }

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: pages } = await supabase
    .from('pages')
    .select('id, fb_page_id, page_name, page_picture_url, agent_enabled, webhook_subscribed, created_at')
    .order('created_at', { ascending: false })

  // Team members own no pages — send them straight to the handoff queue
  if (!pages || pages.length === 0) {
    const { count } = await supabase
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', user.id)
    if ((count ?? 0) > 0) redirect('/dashboard/handoff')
  }

  if (!pages || pages.length === 0) redirect('/dashboard/onboarding')

  // User details & greeting
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'there'
  const firstName = fullName.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  // Page statistics
  const activeCount = pages.filter((p) => p.agent_enabled).length
  const totalCount = pages.length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {greeting}, {firstName}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm flex items-center gap-2">
            <span>Manage your Facebook pages and agent settings</span>
            <span className="inline-block w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
              {activeCount} of {totalCount} pages active
            </span>
          </p>
        </div>
        <div className="flex items-center self-start sm:self-center">
          <ConnectFacebookBtn />
        </div>
      </div>

      <PagesList initialPages={pages} />
    </div>
  )
}
