'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { friendlyError } from '@/lib/friendly-errors'
import { UserPlus, Pencil, Trash2, X, Loader2, Users } from 'lucide-react'

interface TeamMember {
  memberId: string
  email: string
  displayName: string | null
  role: 'viewer' | 'editor' | 'reviewer'
  createdAt: string
  pageCount: number
}

const ROLE_LABELS: Record<string, string> = {
  viewer: 'Viewer',
  editor: 'Editor',
  reviewer: 'Reviewer',
}

const ROLE_COLORS: Record<string, string> = {
  viewer: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  editor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  reviewer: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
}

function getInitials(name: string | null, email: string) {
  if (name) return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

interface AddModalProps {
  onClose: () => void
  onCreated: (m: TeamMember) => void
}

function AddMemberModal({ onClose, onCreated }: AddModalProps) {
  const [form, setForm] = useState<{ displayName: string; email: string; password: string; role: TeamMember['role'] }>({ displayName: '', email: '', password: '', role: 'reviewer' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email.trim() || !form.password) return
    setSaving(true)
    try {
      const res = await fetch('/api/team/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password, display_name: form.displayName, role: form.role }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const member: TeamMember = await res.json()
      onCreated(member)
      toast.success(`Account created for ${member.email}`)
      onClose()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Add Team Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              placeholder="e.g. Ahmed Hassan"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email <span className="text-red-500">*</span></label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="team@example.com"
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Min 6 characters"
              required
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as TeamMember['role'] }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="reviewer">Reviewer — can send replies from Handoff queue</option>
              <option value="editor">Editor — can view and edit all content</option>
              <option value="viewer">Viewer — read-only access</option>
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || !form.email.trim() || !form.password}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {saving ? 'Creating...' : 'Create Account'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface EditModalProps {
  member: TeamMember
  onClose: () => void
  onUpdated: (m: TeamMember) => void
}

function EditMemberModal({ member, onClose, onUpdated }: EditModalProps) {
  const [form, setForm] = useState<{ displayName: string; email: string; password: string; role: TeamMember['role'] }>({
    displayName: member.displayName ?? '',
    email: member.email,
    password: '',
    role: member.role,
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email.trim()) return
    setSaving(true)
    try {
      const body: Record<string, string> = {
        email: form.email,
        display_name: form.displayName,
        role: form.role,
      }
      if (form.password) body.password = form.password

      const res = await fetch(`/api/team/members/${member.memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onUpdated({ ...member, email: form.email, displayName: form.displayName || null, role: form.role as TeamMember['role'] })
      toast.success('Member updated')
      onClose()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Edit Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              placeholder="e.g. Ahmed Hassan"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email <span className="text-red-500">*</span></label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password <span className="text-gray-400 font-normal">(leave blank to keep)</span></label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Leave blank to keep current"
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as TeamMember['role'] }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="reviewer">Reviewer</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || !form.email.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TeamManager() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/team/members')
      if (!res.ok) throw new Error((await res.json()).error)
      setMembers(await res.json())
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (member: TeamMember) => {
    if (!confirm(`Delete account for ${member.email}? This cannot be undone.`)) return
    setDeletingId(member.memberId)
    try {
      const res = await fetch(`/api/team/members/${member.memberId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      setMembers(m => m.filter(x => x.memberId !== member.memberId))
      toast.success('Account deleted')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Team Members
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Create login accounts for your team. They get access to all your pages.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition flex-shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          Add Member
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-10 text-gray-400 dark:text-gray-500">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No team members yet.</p>
          <p className="text-xs mt-1">Click "Add Member" to create the first account.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map(member => (
            <div
              key={member.memberId}
              className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                {getInitials(member.displayName, member.email)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {member.displayName || member.email}
                </p>
                {member.displayName && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[member.role] ?? ROLE_COLORS.viewer}`}>
                    {ROLE_LABELS[member.role] ?? member.role}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {member.pageCount} page{member.pageCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setEditTarget(member)}
                  className="p-2 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(member)}
                  disabled={deletingId === member.memberId}
                  className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                  title="Delete account"
                >
                  {deletingId === member.memberId
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddMemberModal
          onClose={() => setShowAdd(false)}
          onCreated={m => setMembers(prev => [m, ...prev])}
        />
      )}

      {editTarget && (
        <EditMemberModal
          member={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={updated => setMembers(prev => prev.map(m => m.memberId === updated.memberId ? updated : m))}
        />
      )}
    </div>
  )
}
