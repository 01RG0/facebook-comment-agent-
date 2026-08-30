'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'

interface Page { id: string; page_name: string }

interface AiKey { id: string; label: string; provider: string; model: string | null; health: string }

interface Settings {
  id: string
  ai_provider: string
  ai_model: string | null
  custom_base_url?: string | null
  has_custom_api_key: boolean
  preferred_ai_key_ids?: string[] | null
  reply_instructions: string
  reply_language: string
  reply_delay_seconds: number
  max_replies_per_hour: number
  keyword_filter: string[] | null
  blacklisted_user_ids: string[] | null
  reply_to_own_posts_only: boolean
  reply_tone?: string
  reply_length?: string
  reply_blacklist_words?: string[] | null
  review_mode_enabled?: boolean
  auto_retry_enabled?: boolean
  max_retry_attempts?: number
  human_handoff_enabled?: boolean
  human_handoff_keywords?: string[] | null
}

interface HandoffItem {
  id: string
  commenter_name: string
  comment_text: string
  ai_draft: string | null
  status: string
  created_at: string
}

interface Props {
  pages: Page[]
  selectedPageId: string | null
  initialSettings: Settings | null
  handoffItems: HandoffItem[]
}

const AI_PROVIDERS = [
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'mistral', label: 'Mistral AI' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai-compat', label: 'OpenAI-compatible (Custom)' },
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

export default function AiSettingsForm({ pages, selectedPageId, initialSettings, handoffItems }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const [savedKeys, setSavedKeys] = useState<AiKey[]>([])

  useEffect(() => {
    fetch('/api/ai-keys')
      .then(r => r.json())
      .then((data: AiKey[]) => setSavedKeys(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const [form, setForm] = useState({
    ai_provider: initialSettings?.ai_provider ?? 'gemini',
    ai_model: initialSettings?.ai_model ?? '',
    preferred_ai_key_ids: (initialSettings?.preferred_ai_key_ids as string[] | null) ?? [],
    custom_base_url: initialSettings?.custom_base_url ?? '',
    reply_instructions: initialSettings?.reply_instructions ?? 'You are a helpful assistant for this Facebook page. Reply warmly, concisely, and helpfully to comments.',
    reply_language: initialSettings?.reply_language ?? 'auto',
    reply_delay_seconds: initialSettings?.reply_delay_seconds ?? 0,
    max_replies_per_hour: initialSettings?.max_replies_per_hour ?? 100,
    keyword_filter_raw: initialSettings?.keyword_filter?.join(', ') ?? '',
    blacklisted_user_ids_raw: initialSettings?.blacklisted_user_ids?.join(', ') ?? '',
    reply_to_own_posts_only: initialSettings?.reply_to_own_posts_only ?? false,
    reply_tone: initialSettings?.reply_tone ?? 'friendly',
    reply_length: initialSettings?.reply_length ?? 'medium',
    reply_blacklist_words_raw: initialSettings?.reply_blacklist_words?.join(', ') ?? '',
    review_mode_enabled: initialSettings?.review_mode_enabled ?? false,
    auto_retry_enabled: initialSettings?.auto_retry_enabled ?? true,
    max_retry_attempts: initialSettings?.max_retry_attempts ?? 3,
    human_handoff_enabled: initialSettings?.human_handoff_enabled ?? false,
    human_handoff_keywords_raw: initialSettings?.human_handoff_keywords?.join(', ') ?? '',
  })

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testComment, setTestComment] = useState('')
  const [testResult, setTestResult] = useState<{ reply: string; provider: string; model: string } | null>(null)
  const [detectingModels, setDetectingModels] = useState(false)
  const [detectedModels, setDetectedModels] = useState<string[]>([])
  const [handoffList, setHandoffList] = useState<HandoffItem[]>(handoffItems)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(handoffItems.map(h => [h.id, h.ai_draft ?? '']))
  )
  const [sendingHandoff, setSendingHandoff] = useState<string | null>(null)

  const handlePageChange = (id: string) => {
    router.push(`${pathname}?page=${id}`)
  }

  const handleDetectModels = async () => {
    if (!selectedPageId) return
    setDetectingModels(true)
    setDetectedModels([])
    try {
      const res = await fetch(`/api/pages/${selectedPageId}/detect-models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: form.ai_provider,
          base_url: form.custom_base_url || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDetectedModels(data.models ?? [])
      if (data.models?.length === 0) toast.info('No models found for this provider')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDetectingModels(false)
    }
  }

  const handleSendHandoff = async (itemId: string) => {
    setSendingHandoff(itemId)
    try {
      const res = await fetch(`/api/handoff/${itemId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_text: replyDrafts[itemId] }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Reply sent')
      setHandoffList(list => list.filter(h => h.id !== itemId))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSendingHandoff(null)
    }
  }

  const handleDismissHandoff = async (itemId: string) => {
    try {
      const res = await fetch(`/api/handoff/${itemId}/reply`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setHandoffList(list => list.filter(h => h.id !== itemId))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPageId) return
    setSaving(true)

    const payload: Record<string, unknown> = {
      ai_provider: form.ai_provider,
      ai_model: form.ai_model || null,
      preferred_ai_key_ids: form.preferred_ai_key_ids,
      custom_base_url: form.custom_base_url || null,
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
      reply_tone: form.reply_tone,
      reply_length: form.reply_length,
      reply_blacklist_words: form.reply_blacklist_words_raw
        ? form.reply_blacklist_words_raw.split(',').map(s => s.trim()).filter(Boolean)
        : null,
      review_mode_enabled: form.review_mode_enabled,
      auto_retry_enabled: form.auto_retry_enabled,
      max_retry_attempts: form.max_retry_attempts,
      human_handoff_enabled: form.human_handoff_enabled,
      human_handoff_keywords: form.human_handoff_keywords_raw
        ? form.human_handoff_keywords_raw.split(',').map(s => s.trim()).filter(Boolean)
        : null,
    }

    try {
      const res = await fetch(`/api/pages/${selectedPageId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Settings saved')
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
      {/* How it works banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-2">How the agent works</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-blue-800 dark:text-blue-200">
          <span className="inline-flex items-center gap-1.5 bg-white dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-1.5 font-medium">
            <span>💬</span> Someone comments on your Facebook post
          </span>
          <span className="text-blue-400 dark:text-blue-500 font-bold">→</span>
          <span className="inline-flex items-center gap-1.5 bg-white dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-1.5 font-medium">
            <span>🤖</span> AI generates a reply using your instructions
          </span>
          <span className="text-blue-400 dark:text-blue-500 font-bold">→</span>
          <span className="inline-flex items-center gap-1.5 bg-white dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-1.5 font-medium">
            <span>📩</span> Sent as a <strong>private Messenger message</strong> to the commenter
          </span>
        </div>
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
          Replies are always <strong>private</strong> — they arrive in the commenter&apos;s Messenger inbox, not as a public reply on the post.
        </p>
      </div>

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
        <>
        <form onSubmit={handleSave} className="space-y-6">
          {/* AI Provider */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">🤖 AI Provider</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                <select
                  value={form.ai_provider}
                  onChange={e => setForm(f => ({ ...f, ai_provider: e.target.value, ai_model: '', custom_base_url: '' }))}
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
                <div className="flex gap-2">
                  {detectedModels.length > 0 ? (
                    <select
                      value={form.ai_model}
                      onChange={e => setForm(f => ({ ...f, ai_model: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- select model --</option>
                      {detectedModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={form.ai_model}
                      onChange={e => setForm(f => ({ ...f, ai_model: e.target.value }))}
                      placeholder={form.ai_provider === 'gemini' ? 'gemini-2.0-flash' : form.ai_provider === 'mistral' ? 'mistral-large-latest' : 'gpt-4o-mini'}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleDetectModels}
                    disabled={detectingModels}
                    title="Auto-detect available models from provider"
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg transition border border-gray-300 dark:border-gray-600 whitespace-nowrap"
                  >
                    {detectingModels ? '...' : '🔍 Detect'}
                  </button>
                </div>
                {detectedModels.length > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">{detectedModels.length} models found</p>
                )}
              </div>
            </div>

            {(form.ai_provider === 'openai-compat') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Base URL <span className="text-gray-400 font-normal">(e.g. https://openrouter.ai/api/v1)</span>
                </label>
                <input
                  type="url"
                  value={form.custom_base_url}
                  onChange={e => setForm(f => ({ ...f, custom_base_url: e.target.value }))}
                  placeholder="https://your-provider.com/v1"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Any OpenAI-compatible API: OpenRouter, Together AI, Groq, Ollama, etc.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Allowed AI Keys
              </label>
              {savedKeys.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No keys added yet. <a href="/dashboard/ai-keys" className="text-blue-500 hover:underline">Add keys →</a>
                </p>
              ) : (
                <div className="space-y-2">
                  {savedKeys.map(k => (
                    <label key={k.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.preferred_ai_key_ids.includes(k.id)}
                        onChange={e => setForm(f => ({
                          ...f,
                          preferred_ai_key_ids: e.target.checked
                            ? [...f.preferred_ai_key_ids, k.id]
                            : f.preferred_ai_key_ids.filter(id => id !== k.id),
                        }))}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {k.label}
                        <span className="text-gray-400 ml-1">· {k.provider}{k.model ? ` / ${k.model}` : ''}</span>
                        {k.health !== 'healthy' && <span className="ml-1 text-yellow-500 text-xs">⚠ {k.health}</span>}
                      </span>
                    </label>
                  ))}
                  {form.preferred_ai_key_ids.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">None selected — all active keys used (by priority).</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Reply Behavior */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">💬 Private Message Behavior</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Controls how the AI writes the private Messenger reply sent to each commenter.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">AI Instructions</label>
              <textarea
                value={form.reply_instructions}
                onChange={e => setForm(f => ({ ...f, reply_instructions: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Describe the AI&apos;s persona and how it should respond in private messages. The commenter&apos;s original comment is automatically included as context.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tone</label>
                <select
                  value={form.reply_tone}
                  onChange={e => setForm(f => ({ ...f, reply_tone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="friendly">Friendly</option>
                  <option value="formal">Formal</option>
                  <option value="casual">Casual</option>
                  <option value="professional">Professional</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reply Length</label>
                <select
                  value={form.reply_length}
                  onChange={e => setForm(f => ({ ...f, reply_length: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="short">Short (1-2 sentences)</option>
                  <option value="medium">Medium (2-4 sentences)</option>
                  <option value="long">Long (full paragraph)</option>
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Words to Avoid in Reply <span className="text-gray-400 font-normal">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={form.reply_blacklist_words_raw}
                  onChange={e => setForm(f => ({ ...f, reply_blacklist_words_raw: e.target.value }))}
                  placeholder="discount, free, click here"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">AI is instructed to avoid these words in replies.</p>
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

          {/* Automation & Review */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">⚙️ Sending & Review</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Control when and how private messages are sent.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.review_mode_enabled}
                  onChange={e => setForm(f => ({ ...f, review_mode_enabled: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Review before sending</span>
                  <p className="text-xs text-gray-500 mt-0.5">AI drafts the private message but holds it — you review and approve before it reaches the commenter&apos;s Messenger</p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.auto_retry_enabled}
                  onChange={e => setForm(f => ({ ...f, auto_retry_enabled: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-retry on Failure</span>
                  <p className="text-xs text-gray-500 mt-0.5">Retry if the private message fails to send before giving up</p>
                </div>
              </label>
            </div>

            {form.auto_retry_enabled && (
              <div className="sm:w-1/3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Retry Attempts</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={form.max_retry_attempts}
                  onChange={e => setForm(f => ({ ...f, max_retry_attempts: parseInt(e.target.value) || 3 }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* Human Handoff */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">🤝 Human Handoff</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Skip AI for sensitive comments — you write the private reply yourself.</p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.human_handoff_enabled}
                onChange={e => setForm(f => ({ ...f, human_handoff_enabled: e.target.checked }))}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Human Handoff</span>
                <p className="text-xs text-gray-500 mt-0.5">Comments matching trigger keywords are held — no private message is sent until you write and approve one manually in the Pending Handoffs section below</p>
              </div>
            </label>

            {form.human_handoff_enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Trigger Keywords <span className="text-gray-400 font-normal">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={form.human_handoff_keywords_raw}
                  onChange={e => setForm(f => ({ ...f, human_handoff_keywords_raw: e.target.value }))}
                  placeholder="complaint, refund, urgent, legal"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Any comment containing these words skips AI and waits for your manual private reply.</p>
              </div>
            )}
          </div>

          {/* Test Reply */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">🧪 Test Private Message Preview</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Simulate what private Messenger message the AI would send for a given comment — nothing is sent to Facebook.
              </p>
            </div>
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

        {/* Inline Handoff Queue */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">🤝 Pending Handoffs</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Comments held for manual reply — edit the draft and click Send to deliver it as a private Messenger message.</p>
            </div>
            {handoffList.length > 0 && (
              <span className="text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">
                {handoffList.length} pending
              </span>
            )}
          </div>

          {handoffList.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No pending handoffs for this page.</p>
          ) : (
            <div className="space-y-4">
              {handoffList.map(item => (
                <div key={item.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{item.commenter_name}</span>
                      <p className="text-sm text-gray-900 dark:text-white mt-0.5">{item.comment_text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDismissHandoff(item.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition shrink-0"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Reply</label>
                    <textarea
                      rows={2}
                      value={replyDrafts[item.id] ?? ''}
                      onChange={e => setReplyDrafts(d => ({ ...d, [item.id]: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendHandoff(item.id)}
                    disabled={sendingHandoff === item.id || !replyDrafts[item.id]}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-medium rounded-lg transition"
                  >
                    {sendingHandoff === item.id ? 'Sending...' : 'Send Reply'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
      )}
    </div>
  )
}
