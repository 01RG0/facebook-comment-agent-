'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface HandoffItem {
  id: string
  fb_comment_id: string
  commenter_name: string
  comment_text: string
  ai_draft: string | null
  status: 'pending' | 'replied' | 'dismissed'
  notes: string | null
  created_at: string
  pages: { page_name: string } | null
}

export default function HandoffPage() {
  const [items, setItems] = useState<HandoffItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending')

  const load = useCallback(async () => {
    const supabase = createClient()
    const q = supabase
      .from('handoff_queue')
      .select('id, fb_comment_id, commenter_name, comment_text, ai_draft, status, notes, created_at, pages(page_name)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (statusFilter === 'pending') q.eq('status', 'pending')

    const { data } = await q
    setItems((data ?? []) as unknown as HandoffItem[])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const openReply = (item: HandoffItem) => {
    setActiveId(item.id)
    setReplyText(item.ai_draft ?? '')
  }

  const handleReply = async (item: HandoffItem) => {
    if (!replyText.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/handoff/${item.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_text: replyText }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Reply sent')
      setActiveId(null)
      setReplyText('')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  const handleDismiss = async (id: string) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('handoff_queue').update({ status: 'dismissed' }).eq('id', id)
      if (error) throw error
      toast.success('Dismissed')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const pendingCount = items.filter(i => i.status === 'pending').length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            Human Handoff
            {pendingCount > 0 && statusFilter === 'pending' && (
              <span className="text-sm bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2.5 py-0.5 rounded-full font-medium">
                {pendingCount} pending
              </span>
            )}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Comments flagged for manual review — AI drafts provided
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'pending' | 'all')}
          className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="pending">Pending only</option>
          <option value="all">All statuses</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <p className="text-4xl mb-3">🤝</p>
          <p className="text-gray-500 dark:text-gray-400">No handoff items{statusFilter === 'pending' ? ' pending review' : ''}</p>
          <p className="text-xs text-gray-400 mt-1">
            Items appear here when comments match handoff keywords or review mode is enabled
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className={`bg-white dark:bg-gray-900 rounded-xl border p-5 ${
              item.status === 'pending'
                ? 'border-orange-200 dark:border-orange-800'
                : item.status === 'replied'
                ? 'border-green-200 dark:border-green-800 opacity-70'
                : 'border-gray-200 dark:border-gray-800 opacity-50'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-white">{item.commenter_name}</span>
                    <span className="text-xs text-gray-400">{(item.pages as unknown as { page_name: string } | null)?.page_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      item.status === 'pending'
                        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                        : item.status === 'replied'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    }`}>{item.status}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{item.comment_text}</p>

                  {item.ai_draft && (
                    <div className="mt-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                      <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">AI Draft</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{item.ai_draft}</p>
                    </div>
                  )}

                  {activeId === item.id && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        rows={3}
                        placeholder="Edit the reply before sending..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReply(item)}
                          disabled={sending || !replyText.trim()}
                          className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium rounded-lg transition"
                        >
                          {sending ? 'Sending...' : 'Send Reply'}
                        </button>
                        <button
                          onClick={() => { setActiveId(null); setReplyText('') }}
                          className="px-4 py-1.5 text-gray-600 dark:text-gray-400 text-sm hover:text-gray-900 dark:hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 mt-2">{new Date(item.created_at).toLocaleString()}</p>
                </div>

                {item.status === 'pending' && activeId !== item.id && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => openReply(item)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition"
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => handleDismiss(item.id)}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg transition"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
