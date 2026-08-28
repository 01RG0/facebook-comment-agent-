'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface DLQItem {
  id: string
  fb_comment_id: string
  fb_post_id: string
  commenter_name: string
  comment_text: string
  attempts: number
  last_error: string | null
  created_at: string
  resolved_at: string | null
  pages: { page_name: string } | null
}

export default function DLQPage() {
  const [items, setItems] = useState<DLQItem[]>([])
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [resolving, setResolving] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const q = supabase
      .from('dead_letter_comments')
      .select('id, fb_comment_id, fb_post_id, commenter_name, comment_text, attempts, last_error, created_at, resolved_at, pages(page_name)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!showResolved) q.is('resolved_at', null)

    const { data } = await q
    setItems((data ?? []) as unknown as DLQItem[])
    setLoading(false)
  }, [showResolved])

  useEffect(() => { load() }, [load])

  const handleRetry = async (item: DLQItem) => {
    setRetrying(item.id)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Find the comment_log entry for this fb_comment_id
      const { data: logEntry } = await supabase
        .from('comments_log')
        .select('id')
        .eq('fb_comment_id', item.fb_comment_id)
        .single()

      if (logEntry) {
        const res = await fetch(`/api/comments/${logEntry.id}/retry`, { method: 'POST' })
        if (!res.ok) throw new Error((await res.json()).error)
      } else {
        // No log entry, enqueue directly via the page
        const { data: dlqRow } = await supabase
          .from('dead_letter_comments')
          .select('page_id')
          .eq('id', item.id)
          .single()

        if (!dlqRow) throw new Error('DLQ row not found')

        const { data: page } = await supabase
          .from('pages')
          .select('fb_page_id')
          .eq('id', dlqRow.page_id)
          .single()

        if (!page) throw new Error('Page not found')

        const res = await fetch('/api/comments/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageId: dlqRow.page_id,
            fbPageId: page.fb_page_id,
            commentId: item.fb_comment_id,
            postId: item.fb_post_id,
            commenterId: 'unknown',
            commenterName: item.commenter_name,
            message: item.comment_text,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
      }

      toast.success('Re-enqueued for retry')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRetrying(null)
    }
  }

  const handleResolve = async (id: string) => {
    setResolving(id)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('dead_letter_comments')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      toast.success('Marked as resolved')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setResolving(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Failed Comments (DLQ)</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Comments that failed after all retry attempts</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={e => setShowResolved(e.target.checked)}
            className="rounded border-gray-300 text-blue-600"
          />
          Show resolved
        </label>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-gray-500 dark:text-gray-400">No failed comments{showResolved ? '' : ' pending resolution'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className={`bg-white dark:bg-gray-900 rounded-xl border ${item.resolved_at ? 'border-gray-100 dark:border-gray-800 opacity-60' : 'border-red-200 dark:border-red-800'} p-5`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-white">{item.commenter_name}</span>
                    <span className="text-xs text-gray-400">{(item.pages as unknown as { page_name: string } | null)?.page_name}</span>
                    <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
                      {item.attempts} attempts
                    </span>
                    {item.resolved_at && (
                      <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
                        Resolved
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 truncate">{item.comment_text}</p>
                  {item.last_error && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1 font-mono truncate">{item.last_error}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{new Date(item.created_at).toLocaleString()}</p>
                </div>

                {!item.resolved_at && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleRetry(item)}
                      disabled={retrying === item.id}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-medium rounded-lg transition"
                    >
                      {retrying === item.id ? 'Retrying...' : 'Retry'}
                    </button>
                    <button
                      onClick={() => handleResolve(item.id)}
                      disabled={resolving === item.id}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg transition"
                    >
                      {resolving === item.id ? '...' : 'Resolve'}
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
