'use client'

import { useState, useEffect, useCallback } from 'react'
import { Trash2, Users, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { friendlyError } from '@/lib/friendly-errors'

interface Member {
  id: string
  member_email: string
  display_name?: string | null
  role: 'viewer' | 'editor' | 'reviewer'
  invited_at: string
  accepted_at: string | null
}

interface Props {
  pageId: string
}

const ROLE_CONFIG: Record<
  Member['role'],
  { label: string; badgeClasses: string; description: string }
> = {
  editor: {
    label: 'Editor',
    badgeClasses:
      'bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
    description: 'Can edit page settings and full reviewer access',
  },
  reviewer: {
    label: 'Reviewer',
    badgeClasses:
      'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    description: 'Can view, approve, edit, and send replies',
  },
  viewer: {
    label: 'Viewer',
    badgeClasses:
      'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
    description: 'Read-only access to activity log',
  },
}

function getInitials(name?: string | null, email?: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (email?.trim()) {
    return email.trim().slice(0, 2).toUpperCase()
  }
  return '??'
}

export default function TeamMembersPanel({ pageId }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<'viewer' | 'editor' | 'reviewer'>('reviewer')
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/pages/${pageId}/team`)
    if (res.ok) setMembers(await res.json())
    setLoading(false)
  }, [pageId])

  useEffect(() => {
    load()
  }, [load])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setInviting(true)
    try {
      const res = await fetch(`/api/pages/${pageId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_email: email.trim(),
          role,
          display_name: displayName.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Team member invited')
      setEmail('')
      setDisplayName('')
      await load()
    } catch (err) {
      toast.error(friendlyError(err))
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
      toast.error(friendlyError(err))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200/80 dark:border-gray-800 shadow-sm p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          Team Members
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage teammates who have access to this page&apos;s activity and handoff queue.
        </p>
      </div>

      {/* Members list */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          <span>Loading team members...</span>
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-lg border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 mb-2.5">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            No team members yet. Invite someone below.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => {
            const roleInfo = ROLE_CONFIG[m.role] || ROLE_CONFIG.viewer
            const initials = getInitials(m.display_name, m.member_email)
            const isRemoving = removing === m.id

            return (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 sm:px-4 sm:py-3 rounded-lg border border-gray-100 dark:border-gray-800/80 bg-gray-50/40 dark:bg-gray-800/30 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Initials Avatar */}
                  <div className="w-9 h-9 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                    {initials}
                  </div>

                  {/* Name / Email */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {m.display_name || m.member_email}
                      </span>
                      {!m.accepted_at && (
                        <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/60">
                          Pending
                        </span>
                      )}
                    </div>
                    {m.display_name && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {m.member_email}
                      </p>
                    )}
                  </div>
                </div>

                {/* Role badge & actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Role Badge with Hover Tooltip */}
                  <div className="relative group cursor-help">
                    <span
                      title={roleInfo.description}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${roleInfo.badgeClasses}`}
                    >
                      {roleInfo.label}
                    </span>
                    <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:block z-20 w-max max-w-xs px-2.5 py-1 text-xs text-white bg-gray-900 dark:bg-gray-800 rounded shadow-md border border-gray-700/50 pointer-events-none whitespace-normal text-center">
                      {roleInfo.description}
                    </div>
                  </div>

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => handleRemove(m.id)}
                    disabled={isRemoving}
                    aria-label="Remove member"
                    title="Remove member"
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isRemoving ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Invite form at bottom */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Name (optional)"
            className="flex-1 w-full sm:min-w-[130px] px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@email.com"
            required
            className="flex-[1.5] w-full sm:min-w-[190px] px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'viewer' | 'editor' | 'reviewer')}
            className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors cursor-pointer"
          >
            <option value="editor">Editor</option>
            <option value="reviewer">Reviewer</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0 shadow-sm"
          >
            {inviting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Inviting...</span>
              </>
            ) : (
              'Invite'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
