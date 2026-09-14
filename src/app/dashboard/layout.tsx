import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/dashboard-nav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [profileResult, teamMemberResult] = await Promise.all([
    supabase.from('profiles').select('full_name, email, avatar_url, is_admin').eq('id', user.id).single(),
    supabase.from('team_members').select('id, role').eq('member_id', user.id),
  ])

  const teamMemberships = teamMemberResult.data ?? []
  const isTeamMember = teamMemberships.length > 0
  const hasEditorOrReviewerRole = teamMemberships.some((m: { role?: string | null }) =>
    m.role === 'editor' || m.role === 'reviewer'
  )
  const canAccessInbox = !isTeamMember || hasEditorOrReviewerRole
  const isAdmin = profileResult.data?.is_admin === true

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex flex-col">
      <DashboardNav
        user={profileResult.data ?? { email: user.email ?? '', full_name: null, avatar_url: null }}
        isTeamMember={isTeamMember}
        isAdmin={isAdmin}
        canAccessInbox={canAccessInbox}
      />
      <div className="flex-1 lg:pl-64 pt-16 transition-all duration-300">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
