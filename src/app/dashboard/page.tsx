import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PagesList from '@/components/pages-list'
import ConnectFacebookBtn from '@/components/connect-facebook-btn'

export const metadata: Metadata = { title: 'Pages' }

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: pages } = await supabase
    .from('pages')
    .select('id, fb_page_id, page_name, page_picture_url, agent_enabled, webhook_subscribed, created_at')
    .order('created_at', { ascending: false })

  if (!pages || pages.length === 0) redirect('/dashboard/onboarding')

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Connected Pages</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Manage your Facebook pages and agent settings
          </p>
        </div>
        <ConnectFacebookBtn />
      </div>

      {!pages || pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No pages connected yet
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-sm">
            Connect your Facebook Page to start automatically replying to comments with AI.
          </p>
        </div>
      ) : (
        <PagesList initialPages={pages} />
      )}
    </div>
  )
}
