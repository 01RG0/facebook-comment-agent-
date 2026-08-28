'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import Link from 'next/link'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface User {
  id: string
  email: string
  full_name: string | null
  created_at: string
  page_count: number
  today: { requests: number; tokens: number }
  limits: {
    max_requests_per_day: number | null
    max_tokens_per_day: number | null
    is_suspended: boolean
    notes: string | null
  } | null
}

interface LimitsForm {
  max_requests_per_day: string
  max_tokens_per_day: string
  max_requests_per_month: string
  max_tokens_per_month: string
  is_suspended: boolean
  notes: string
}

export default function AdminUsersPanel() {
  const { data: users, isLoading, mutate } = useSWR<User[]>('/api/admin/users', fetcher, { refreshInterval: 60000 })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [limitsForm, setLimitsForm] = useState<Record<string, LimitsForm>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const openLimits = (user: User) => {
    const existing = user.limits
    setLimitsForm(f => ({
      ...f,
      [user.id]: {
        max_requests_per_day: existing?.max_requests_per_day?.toString() ?? '',
        max_tokens_per_day: existing?.max_tokens_per_day?.toString() ?? '',
        max_requests_per_month: '',
        max_tokens_per_month: '',
        is_suspended: existing?.is_suspended ?? false,
        notes: existing?.notes ?? '',
      }
    }))
    setExpandedId(expandedId === user.id ? null : user.id)
  }

  const saveLimits = async (userId: string) => {
    const form = limitsForm[userId]
    if (!form) return
    setSaving(s => ({ ...s, [userId]: true }))
    try {
      const res = await fetch(`/api/admin/users/${userId}/limits`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_requests_per_day: form.max_requests_per_day ? parseInt(form.max_requests_per_day) : null,
          max_tokens_per_day: form.max_tokens_per_day ? parseInt(form.max_tokens_per_day) : null,
          max_requests_per_month: form.max_requests_per_month ? parseInt(form.max_requests_per_month) : null,
          max_tokens_per_month: form.max_tokens_per_month ? parseInt(form.max_tokens_per_month) : null,
          is_suspended: form.is_suspended,
          notes: form.notes || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Limits saved')
      mutate()
      setExpandedId(null)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(s => ({ ...s, [userId]: false }))
    }
  }

  const removeLimits = async (userId: string) => {
    if (!confirm('Remove all limits for this user?')) return
    const res = await fetch(`/api/admin/users/${userId}/limits`, { method: 'DELETE' })
    if (res.ok) { toast.success('Limits removed'); mutate() }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-gray-400 mt-1 text-sm">{users?.length ?? 0} registered users</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="divide-y divide-gray-800">
          {(users ?? []).map(user => {
            const form = limitsForm[user.id]
            return (
              <div key={user.id}>
                <div className="px-5 py-4 flex items-center gap-4">
                  <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                    {(user.full_name ?? user.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-sm">{user.email}</span>
                      {user.limits?.is_suspended && (
                        <span className="text-xs bg-red-900/50 text-red-400 border border-red-800 px-1.5 py-0.5 rounded-full">Suspended</span>
                      )}
                      {user.limits && !user.limits.is_suspended && (
                        <span className="text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-800/50 px-1.5 py-0.5 rounded-full">Limited</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                      <span>{user.page_count} pages</span>
                      <span>·</span>
                      <span>{user.today.requests} req today</span>
                      <span>·</span>
                      <span>{user.today.tokens.toLocaleString()} tokens today</span>
                      <span>·</span>
                      <span>joined {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/admin/logs?user_id=${user.id}`}
                      className="text-xs text-gray-400 hover:text-blue-400 transition px-2 py-1.5 rounded hover:bg-gray-800"
                    >
                      Logs
                    </Link>
                    <button
                      onClick={() => openLimits(user)}
                      className="text-xs text-gray-400 hover:text-white transition px-2 py-1.5 rounded hover:bg-gray-800"
                    >
                      {expandedId === user.id ? 'Cancel' : 'Set Limits'}
                    </button>
                  </div>
                </div>

                {expandedId === user.id && form && (
                  <div className="px-5 pb-5 bg-gray-800/30 border-t border-gray-800">
                    <div className="pt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      {[
                        { key: 'max_requests_per_day', label: 'Max Requests / Day' },
                        { key: 'max_tokens_per_day', label: 'Max Tokens / Day' },
                        { key: 'max_requests_per_month', label: 'Max Requests / Month' },
                        { key: 'max_tokens_per_month', label: 'Max Tokens / Month' },
                      ].map(field => (
                        <div key={field.key}>
                          <label className="block text-xs font-medium text-gray-400 mb-1">{field.label}</label>
                          <input
                            type="number"
                            value={form[field.key as keyof LimitsForm] as string}
                            onChange={e => setLimitsForm(f => ({ ...f, [user.id]: { ...f[user.id], [field.key]: e.target.value } }))}
                            placeholder="Unlimited"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.is_suspended}
                          onChange={e => setLimitsForm(f => ({ ...f, [user.id]: { ...f[user.id], is_suspended: e.target.checked } }))}
                          className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-red-600 focus:ring-red-500"
                        />
                        <span className="text-sm text-red-400 font-medium">Suspend account</span>
                      </label>
                    </div>
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-400 mb-1">Notes (internal)</label>
                      <input
                        type="text"
                        value={form.notes}
                        onChange={e => setLimitsForm(f => ({ ...f, [user.id]: { ...f[user.id], notes: e.target.value } }))}
                        placeholder="Optional admin notes"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => saveLimits(user.id)}
                        disabled={saving[user.id]}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-sm font-medium rounded-lg transition"
                      >
                        {saving[user.id] ? 'Saving...' : 'Save Limits'}
                      </button>
                      {user.limits && (
                        <button
                          onClick={() => removeLimits(user.id)}
                          className="px-4 py-2 text-red-400 hover:text-red-300 text-sm transition"
                        >
                          Remove All Limits
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {!users?.length && (
            <div className="py-12 text-center text-gray-500">No users yet</div>
          )}
        </div>
      </div>
    </div>
  )
}
