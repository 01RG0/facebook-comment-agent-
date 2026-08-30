'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

interface Member {
  id: string
  member_email: string
  role: 'viewer' | 'editor' | 'reviewer'
  invited_at: string
  accepted_at: string | null
}

interface Props {
  pageId: string
}

export default function TeamMembersPanel({ pageId }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'viewer' | 'editor' | 'reviewer'>('reviewer')
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/pages/${pageId}/team`)
    if (res.ok) setMembers(await res.json())
    setLoading(false)
  }, [pageId])

  useEffect(() => { load() }, [load])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setInviting(true)
    try {
      const res = await fetch(`/api/pages/${pageId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_email: email.trim(), role }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Team member invited')
      setEmail('')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (memberId: string) => {
    setRemoving(memberId)
    try {
      const res = await fetch(`/api/pages/${pageId}/team`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Member removed')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
      <h2 className="font-semibold text-gray-900 dark:text-white">👥 Team Members</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Invite team members to access this page&apos;s activity and handoff queue.
      </p>

      {/* Role descriptions */}
      <div className="grid sm:grid-cols-3 gap-2 text-xs">
        {[
          { r: 'reviewer', icon: '✅', label: 'Reviewer', desc: 'Can view, approve, edit, and send replies from the Handoff queue — access to Messenger replies' },
          { r: 'viewer',   icon: '👁️', label: 'Viewer',   desc: 'Can view activity log only — read-only access, no actions' },
          { r: 'editor',   icon: '✏️', label: 'Editor',   desc: 'Full reviewer access plus can edit page settings' },
        ].map(({ r, icon, label, desc }) => (
          <div key={r} className={`rounded-lg border p-2.5 ${role === r ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <p className="font-medium text-gray-800 dark:text-gray-200">{icon} {label}</p>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleInvite} className="flex gap-3 flex-wrap">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="teammate@email.com"
          required
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value as 'viewer' | 'editor' | 'reviewer')}
          className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="reviewer">Reviewer</option>
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button
          type="submit"
          disabled={inviting}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition"
        >
          {inviting ? 'Inviting...' : 'Invite'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No team members yet</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {members.map(m => (
            <div key={m.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{m.member_email}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium mr-1 ${
                    m.role === 'reviewer' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                    m.role === 'editor'   ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                    'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>{m.role}</span>
                  {m.accepted_at ? '✓ Active' : '⏳ Pending invite'} · {new Date(m.invited_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleRemove(m.id)}
                disabled={removing === m.id}
                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition disabled:opacity-50"
              >
                {removing === m.id ? 'Removing...' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
