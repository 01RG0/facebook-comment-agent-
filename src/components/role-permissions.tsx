'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { friendlyError } from '@/lib/friendly-errors'
import { Loader2, ShieldCheck } from 'lucide-react'

const ALL_PAGES = [
  { key: 'comments', label: 'Comments' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'sequences', label: 'Sequences' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'handoff', label: 'Handoff' },
  { key: 'activity', label: 'Activity' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'dlq', label: 'Failed DLQ' },
  { key: 'ai-keys', label: 'AI Keys' },
  { key: 'settings', label: 'Settings' },
]

const ROLES = [
  { key: 'reviewer', label: 'Reviewer' },
  { key: 'editor', label: 'Editor' },
  { key: 'viewer', label: 'Viewer' },
]

type Permissions = Record<string, string[]>

export default function RolePermissions() {
  const [perms, setPerms] = useState<Permissions | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/team/permissions')
      if (!res.ok) throw new Error((await res.json()).error)
      setPerms(await res.json())
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (role: string, page: string) => {
    setPerms(prev => {
      if (!prev) return prev
      const current = prev[role] ?? []
      const next = current.includes(page)
        ? current.filter(p => p !== page)
        : [...current, page]
      return { ...prev, [role]: next }
    })
  }

  const handleSave = async () => {
    if (!perms) return
    setSaving(true)
    try {
      const res = await fetch('/api/team/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(perms),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Role permissions saved')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  if (!perms) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-violet-500" />
            Role Permissions
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Choose which pages each role can access. Changes apply on next login.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-medium rounded-lg transition flex-shrink-0"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? 'Saving...' : 'Save Permissions'}
        </button>
      </div>

      {/* Grid: roles as columns, pages as rows — stacks on mobile */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[400px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-36">Page</th>
              {ROLES.map(r => (
                <th key={r.key} className="text-center py-2 px-3 text-xs font-medium text-gray-700 dark:text-gray-200">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_PAGES.map(page => (
              <tr key={page.key} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300 font-medium">{page.label}</td>
                {ROLES.map(role => {
                  const checked = (perms[role.key] ?? []).includes(page.key)
                  return (
                    <td key={role.key} className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(role.key, page.key)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500 cursor-pointer"
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
