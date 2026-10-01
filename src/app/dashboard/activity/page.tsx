import { Suspense } from 'react'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ActivityHome from './activity-home'

export const metadata: Metadata = { title: 'Activity' }

export default async function ActivityPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <Suspense fallback={null}>
      <ActivityHome />
    </Suspense>
  )
}
