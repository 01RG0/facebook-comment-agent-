'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  Star,
  RefreshCw,
  ChevronLeft,
  Trash2,
  Send,
  Loader2,
  MessageSquare,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Review {
  id: string
  accountId: string
  reviewerName: string
  reviewerPicture: string | null
  rating: number
  text: string
  createdTime: string
  hasReply: boolean
  replyText: string | null
  replyCreatedTime: string | null
  page_id: string
  page_name: string
  zernio_account_id: string
}

const COLORS = [
  'bg-violet-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-rose-500',
  'bg-indigo-500',
]

function avatarColor(name: string) {
  let h = 0
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}

function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return p.length === 1
    ? p[0].slice(0, 2).toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function timeAgo(t?: string | null) {
  if (!t) return 'recently'
  try {
    return formatDistanceToNow(new Date(t), { addSuffix: true })
  } catch {
    return 'recently'
  }
}

function StarRating({ rating, className }: { rating: number; className?: string }) {
  const total = 5
  const stars = []
  for (let i = 1; i <= total; i++) {
    stars.push(
      <span
        key={i}
        className={cn(
          'text-base leading-none select-none',
          i <= rating ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600',
          className
        )}
      >
        {i <= rating ? '★' : '☆'}
      </span>
    )
  }
  return <div className="inline-flex items-center gap-0.5">{stars}</div>
}

export default function ReviewsClient() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedReview, setSelectedReview] = useState<Review | null>(null)
  const [selectedRatingFilter, setSelectedRatingFilter] = useState<number | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [deletingReply, setDeletingReply] = useState(false)

  const loadReviews = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reviews')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch reviews')
      const items: Review[] = data.reviews ?? []
      setReviews(items)
      setNextCursor(data.nextCursor ?? null)
      if (items.length > 0) {
        setSelectedReview(prev => {
          if (!prev) return items[0]
          const existing = items.find(r => r.id === prev.id)
          return existing ?? items[0]
        })
      } else {
        setSelectedReview(null)
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load reviews')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMoreReviews = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/reviews?cursor=${encodeURIComponent(nextCursor)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load more reviews')
      setReviews(prev => [...prev, ...(data.reviews ?? [])])
      setNextCursor(data.nextCursor ?? null)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load more reviews')
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    loadReviews()
  }, [loadReviews])

  const handleSendReply = async () => {
    if (!selectedReview || !replyText.trim() || sendingReply) return
    setSendingReply(true)
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(selectedReview.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reply',
          accountId: selectedReview.zernio_account_id,
          message: replyText.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to post reply')

      toast.success('Reply posted successfully')
      const updatedReplyText = replyText.trim()
      const nowIso = new Date().toISOString()

      const updateReviewState = (r: Review) =>
        r.id === selectedReview.id
          ? {
              ...r,
              hasReply: true,
              replyText: updatedReplyText,
              replyCreatedTime: nowIso,
            }
          : r

      setReviews(prev => prev.map(updateReviewState))
      setSelectedReview(prev =>
        prev
          ? {
              ...prev,
              hasReply: true,
              replyText: updatedReplyText,
              replyCreatedTime: nowIso,
            }
          : null
      )
      setReplyText('')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to post reply')
    } finally {
      setSendingReply(false)
    }
  }

  const handleDeleteReply = async () => {
    if (!selectedReview || deletingReply) return
    if (!confirm('Are you sure you want to delete this reply?')) return

    setDeletingReply(true)
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(selectedReview.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-reply',
          accountId: selectedReview.zernio_account_id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete reply')

      toast.success('Reply deleted')
      const updateReviewState = (r: Review) =>
        r.id === selectedReview.id
          ? {
              ...r,
              hasReply: false,
              replyText: null,
              replyCreatedTime: null,
            }
          : r

      setReviews(prev => prev.map(updateReviewState))
      setSelectedReview(prev =>
        prev
          ? {
              ...prev,
              hasReply: false,
              replyText: null,
              replyCreatedTime: null,
            }
          : null
      )
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete reply')
    } finally {
      setDeletingReply(false)
    }
  }

  const filteredReviews = reviews.filter(r => {
    if (selectedRatingFilter === null) return true
    return r.rating === selectedRatingFilter
  })

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
      {/* LEFT PANEL: Review List */}
      <div
        className={cn(
          'w-full md:w-80 lg:w-96 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 shrink-0',
          selectedReview ? 'hidden md:flex' : 'flex'
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Reviews</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium">
              {reviews.length}
            </span>
          </div>
          <button
            onClick={loadReviews}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition"
            title="Refresh reviews"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>

        {/* Rating Filter Bar */}
        <div className="p-2 border-b border-gray-200 dark:border-gray-800 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 min-w-max">
            <button
              onClick={() => setSelectedRatingFilter(null)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-lg transition',
                selectedRatingFilter === null
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-800'
              )}
            >
              All
            </button>
            {[5, 4, 3, 2, 1].map(stars => (
              <button
                key={stars}
                onClick={() => setSelectedRatingFilter(selectedRatingFilter === stars ? null : stars)}
                className={cn(
                  'px-2 py-1 text-xs font-medium rounded-lg transition flex items-center gap-0.5',
                  selectedRatingFilter === stars
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-800'
                )}
              >
                <span>{stars}</span>
                <span className="text-[11px]">★</span>
              </button>
            ))}
          </div>
        </div>

        {/* Reviews Items */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div
                key={i}
                className="flex gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 animate-pulse border border-gray-100 dark:border-gray-800"
              >
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))
          ) : filteredReviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
              <Star className="w-10 h-10 mb-3 opacity-30 text-amber-500" />
              <p className="text-sm font-medium">No reviews found</p>
              <p className="text-xs mt-1">Reviews from connected pages will show here</p>
            </div>
          ) : (
            filteredReviews.map(review => {
              const isSelected = selectedReview?.id === review.id
              return (
                <button
                  key={review.id}
                  onClick={() => setSelectedReview(review)}
                  className={cn(
                    'w-full text-left p-3 rounded-xl transition flex gap-3 items-start border',
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
                      : 'border-transparent hover:bg-white dark:hover:bg-gray-800/60 hover:border-gray-200 dark:hover:border-gray-700'
                  )}
                >
                  {review.reviewerPicture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={review.reviewerPicture}
                      alt={review.reviewerName}
                      className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200 dark:border-gray-700"
                    />
                  ) : (
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold',
                        avatarColor(review.reviewerName)
                      )}
                    >
                      {initials(review.reviewerName)}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                        {review.reviewerName}
                      </span>
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {timeAgo(review.createdTime)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mb-1">
                      <StarRating rating={review.rating} />
                      <span className="text-[11px] text-gray-400 truncate">
                        · {review.page_name}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                      {review.text || <span className="italic text-gray-400">No review text</span>}
                    </p>

                    {review.hasReply && (
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Replied
                      </div>
                    )}
                  </div>
                </button>
              )
            })
          )}

          {nextCursor && (
            <div className="pt-2 pb-1 text-center">
              <button
                onClick={loadMoreReviews}
                disabled={loadingMore}
                className="w-full py-2 px-3 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading more reviews...</span>
                  </>
                ) : (
                  <span>Load more reviews</span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Review Detail */}
      <div className={cn('flex-1 flex flex-col', !selectedReview ? 'hidden md:flex' : 'flex')}>
        {!selectedReview ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 p-8">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Star className="w-8 h-8 opacity-40 text-amber-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Select a review</p>
              <p className="text-sm mt-0.5">Choose a review from the left to view details and manage replies</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 bg-white dark:bg-gray-900">
              <button
                onClick={() => setSelectedReview(null)}
                className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 flex-1 min-w-0">
                {selectedReview.reviewerPicture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedReview.reviewerPicture}
                    alt={selectedReview.reviewerName}
                    className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700 shrink-0"
                  />
                ) : (
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0',
                      avatarColor(selectedReview.reviewerName)
                    )}
                  >
                    {initials(selectedReview.reviewerName)}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="font-bold text-gray-900 dark:text-white truncate">
                    {selectedReview.reviewerName}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {selectedReview.page_name} · {timeAgo(selectedReview.createdTime)}
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-1.5">
                <StarRating rating={selectedReview.rating} className="text-lg" />
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Review content box */}
              <div className="bg-gray-50/70 dark:bg-gray-800/40 rounded-2xl p-5 border border-gray-200/80 dark:border-gray-700/80 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <StarRating rating={selectedReview.rating} className="text-xl" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {selectedReview.rating} out of 5 stars
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(selectedReview.createdTime).toLocaleString()}
                  </span>
                </div>

                <p className="text-base text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                  {selectedReview.text || <span className="italic text-gray-400">No review comments provided.</span>}
                </p>
              </div>

              {/* Reply Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  <span>Page Reply</span>
                </h3>

                {selectedReview.hasReply && selectedReview.replyText ? (
                  <div className="bg-blue-50/50 dark:bg-blue-950/20 border-l-4 border-blue-500 rounded-r-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                        {selectedReview.page_name} replied:
                      </span>
                      {selectedReview.replyCreatedTime && (
                        <span className="text-[11px] text-gray-400">
                          {timeAgo(selectedReview.replyCreatedTime)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {selectedReview.replyText}
                    </p>
                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={handleDeleteReply}
                        disabled={deletingReply}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900/50 transition disabled:opacity-50"
                      >
                        {deletingReply ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>Delete Reply</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                    <textarea
                      rows={4}
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder={`Reply as ${selectedReview.page_name}...`}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder-gray-400"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        Replying publicly as Page
                      </span>
                      <button
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || sendingReply}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        {sendingReply ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        <span>Send Reply</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
