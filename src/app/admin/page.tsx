import { Metadata } from 'next'
import AdminOverview from '@/components/admin/admin-overview'

export const metadata: Metadata = { title: 'Admin Overview' }

export default function AdminPage() {
  return <AdminOverview />
}
