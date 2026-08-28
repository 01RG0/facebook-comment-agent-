'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'

interface Page { id: string; page_name: string }

interface Settings {
  id: string
  ai_provider: string
  ai_model: string | null
  has_custom_api_key: boolean
  reply_instructions: string
  reply_language: string
  reply_delay_seconds: number
  max_replies_per_hour: number
  keyword_filter: string[] | null
  blacklisted_user_ids: string[] | null
  reply_to_own_posts_only: boolean
}

interface Props {
  pages: Page[]
  selectedPageId: string | null
  initialSettings: Settings | null
}

const AI_PROVIDERS = [
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'mistral', label: 'Mistral AI' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai-compat', label: 'OpenAI-compatible' },
]

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect (same as commenter)' },
  { value: 'English', label: 'English' },
  { value: 'Arabic', label: 'Arabic' },
  { value: 'French', label: 'French' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'German', label: 'German' },
  { value: 'Turkish', label: 'Turkish' },
  { value: 'Portuguese', label: 'Portuguese' },
  { value: 'Indonesian', label: 'Indonesian' },
]

export default function AiSettingsForm({ pages, selectedPageId, initialSettings }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const [form, setForm] = useState({
    ai_provider: initialSettings?.ai_provider ?? 'gemini',
    ai_model: initialSettings?.ai_model ?? '',
    ai_api_key: '',
    reply_instructions: initialSettings?.reply_instructions ?? 'You are a helpful assistant for this Facebook page. Reply warmly, concisely, and helpfully to comments.',
    reply_language: initialSettings?.reply_language ?? 'auto',
    reply_delay_seconds: initialSettings?.reply_delay_seconds ?? 0,
    max_replies_per_hour: initialSettings?.max_replies_per_hour ?? 100,
    keyword_filter_raw: initialSettings?.keyword_filter?.join(', ') ?? '',
    blacklisted_user_ids_raw: initialSettings?.blacklisted_user_ids?.join(', ') ?? '',
    reply_to_own_posts_only: initialSettings?.reply_to_own_posts_only ?? false,
  })

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testComment, setTestComment] = useState('')
  const [testResult, setTestResult] = useState<{ reply: string; provider: string; model: string } | null>(null)

  const handlePageChange = (id: string) => {
    router.push(`${pathname}?page=${id}`)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPageId) return
    setSaving(true)

    const payload: Record<string, unknown> = {
      ai_provider: form.ai_provider,
      ai_model: form.ai_model || null,
      reply_instructions: form.reply_instructions,
      reply_language: form.reply_language,
      reply_delay_seconds: form.reply_delay_seconds,
      max_replies_per_hour: form.max_replies_per_hour,
      keyword_filter: form.keyword_filter_raw
        ? form.keyword_filter_raw.split(',').map(s => s.trim()).filter(Boolean)
        : null,
      blacklisted_user_ids: form.blacklisted_user_ids_raw
        ? form.blacklisted_user_ids_raw.split(',').map(s => s.trim()).filter(Boolean)
        : null,
      reply_to_own_posts_only: form.reply_to_own_posts_only,
    }

    if (form.ai_api_key) payload.ai_api_key = form.ai_api_key

    try {
      const res = await fetch(`/api/pages/${selectedPageId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Settings saved')
      setForm(f => ({ ...f, ai_api_key: '' }))
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleTestReply = async () => {
    if (!selectedPageId || !testComment) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`/api/pages/${selectedPageId}/test-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_text: testComment }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTestResult(data)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page selector */}
      {pages.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Page</label>
          <select
            value={selectedPageId ?? ''}
            onChange={e => handlePageChange(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {pages.map(p => (
              <option key={p.id} value={p.id}>{p.page_name}</option>
            ))}
          </select>
        </div>
      )}

      {selectedPageId && (
        <form onSubmit={handleSave} className="space-y-6">
          {/* AI Provider */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">🤖 AI Provider</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                <select
                  value={form.ai_provider}
                  onChange={e => setForm(f => ({ ...f, ai_provider: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {AI_PROVIDERS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.ai_model}
                  onChange={e => setForm(f => ({ ...f, ai_model: e.target.value }))}
                  placeholder={form.ai_provider === 'gemini' ? 'gemini-2.0-flash' : form.ai_provider === 'mistral' ? 'mistral-large-latest' : 'gpt-4o-mini'}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                API Key {initialSettings?.has_custom_api_key && <span className="text-green-500 font-normal">(saved)</span>}
              </label>
              <input
                type="password"
                value={form.ai_api_key}
                onChange={e => setForm(f => ({ ...f, ai_api_key: e.target.value }))}
                placeholder={initialSettings?.has_custom_api_key ? '••••••••••• (leave blank to keep current)' : 'Uses system key if blank'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Stored encrypted. Leave blank to use the system-level API key.
              </p>
            </div>
          </div>

          {/* Reply Behavior */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">💬 Reply Behavior</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">System Instructions</label>
              <textarea
                value={form.reply_instructions}
                onChange={e => setForm(f => ({ ...f, reply_instructions: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Tell the AI who it is and how to respond.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reply Language</label>
                <select
                  value={form.reply_language}
                  onChange={e => setForm(f => ({ ...f, reply_language: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {LANGUAGES.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reply Delay (seconds)
                </label>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={form.reply_delay_seconds}
                  onChange={e => setForm(f => ({ ...f, reply_delay_seconds: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">0 = reply immediately. Adds human-like delay.</p>
              </div>
            </div>
          </div>

          {/* Filters & Limits */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">🛡️ Filters & Limits</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max Replies / Hour
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={form.max_replies_per_hour}
                  onChange={e => setForm(f => ({ ...f, max_replies_per_hour: parseInt(e.target.value) || 100 }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="own_posts"
                  checked={form.reply_to_own_posts_only}
                  onChange={e => setForm(f => ({ ...f, reply_to_own_posts_only: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="own_posts" className="text-sm text-gray-700 dark:text-gray-300">
                  Only reply to comments on my own posts
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Keyword Filter <span className="text-gray-400 font-normal">(comma-separated)</span>
              </label>
              <input
                type="text"
                value={form.keyword_filter_raw}
                onChange={e => setForm(f => ({ ...f, keyword_filter_raw: e.target.value }))}
                placeholder="price, info, contact — only reply to comments containing these words"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Leave blank to reply to all comments.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Blacklisted User IDs <span className="text-gray-400 font-normal">(comma-separated Facebook IDs)</span>
              </label>
              <input
                type="text"
                value={form.blacklisted_user_ids_raw}
                onChange={e => setForm(f => ({ ...f, blacklisted_user_ids_raw: e.target.value }))}
                placeholder="123456789, 987654321"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Test Reply */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">🧪 Test Reply Preview</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Generate a sample reply using current saved settings — nothing is sent to Facebook.
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={testComment}
                onChange={e => setTestComment(e.target.value)}
                placeholder="Enter a sample comment..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleTestReply}
                disabled={testing || !testComment}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white text-sm font-medium rounded-lg transition"
              >
                {testing ? 'Generating...' : 'Test'}
              </button>
            </div>
            {testResult && (
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <p className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
                  {testResult.provider} / {testResult.model}
                </p>
                <p className="text-sm text-gray-800 dark:text-gray-200">{testResult.reply}</p>
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
