import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/dashboard-nav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [profileResult, pagesResult] = await Promise.all([
    supabase.from('profiles').select('full_name, email, avatar_url').eq('id', user.id).single(),
    supabase.from('pages').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  // If user owns no pages they are a team member — redirect root dashboard to handoff
  const isTeamMember = (pagesResult.count ?? 0) === 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <DashboardNav
        user={profileResult.data ?? { email: user.email ?? '', full_name: null, avatar_url: null }}
        isTeamMember={isTeamMember}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
