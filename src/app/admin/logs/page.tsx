import { Metadata } from 'next'
import AdminLogsPanel from '@/components/admin/admin-logs-panel'

export const metadata: Metadata = { title: 'Admin — AI Logs' }

export default function AdminLogsPage() {
  return <AdminLogsPanel />
}
