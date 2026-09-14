import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReviewsClient from './reviews-client'

export const metadata: Metadata = {
  title: 'Reviews',
  description: 'Manage and reply to Facebook page reviews',
}

export default async function ReviewsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  return <ReviewsClient />
}
