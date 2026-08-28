import { Metadata } from 'next'
import AdminProvidersPanel from '@/components/admin/admin-providers-panel'

export const metadata: Metadata = { title: 'Admin — AI Providers' }

export default function AdminProvidersPage() {
  return <AdminProvidersPanel />
}
