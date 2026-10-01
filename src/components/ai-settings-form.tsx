'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import {
  Check, X, Loader2, ChevronDown, ChevronUp,
  Sparkles, MessageSquare, Globe, Zap, FlaskConical,
  Plus, Eye, EyeOff,
} from 'lucide-react'
import { friendlyError } from '@/lib/friendly-errors'

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
  public_comment_reply_enabled?: boolean
  public_comment_reply_text?: string | null
  public_comment_on_approval?: boolean
  public_comment_reply_mode?: string | null
  public_comment_ai_instructions?: string | null
  messaging_unavailable_reply?: string | null
}

interface Props {
  pages: Page[]
  selectedPageId: string | null
  initialSettings: Settings | null
}

const PRESET_TONES = ['friendly', 'professional', 'formal', 'casual']

const LANGUAGES = [
  { value: 'auto', label: 'Same as commenter (auto)' },
  { value: 'Egyptian Arabic', label: 'عربي مصري (Egyptian Arabic)' },
  { value: 'Arabic', label: 'Arabic (Standard)' },
  { value: 'English', label: 'English' },
  { value: 'French', label: 'French' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'German', label: 'German' },
  { value: 'Turkish', label: 'Turkish' },
  { value: 'Portuguese', label: 'Portuguese' },
  { value: 'Indonesian', label: 'Indonesian' },
]

const AI_PROVIDERS = [
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'mistral', label: 'Mistral AI' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai-compat', label: 'OpenAI-compatible (Custom)' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function compileInstructions(f: {
  builder_name: string; builder_type: string; builder_offer: string
  builder_topics: string[]; builder_never_say: string[]
  builder_skip_words: string[]; builder_custom_rules: string[]
}): string {
  const parts: string[] = []

  const identity = [
    f.builder_name && `اسم الشركة أو الصفحة هو "${f.builder_name}".`,
    f.builder_type && `أنت مساعد ذكي لـ ${f.builder_type}.`,
    f.builder_offer?.trim(),
  ].filter(Boolean).join(' ')
  if (identity) parts.push(identity)

  if (f.builder_topics.length)
    parts.push(`يمكنك مساعدة العملاء في: ${f.builder_topics.join('، ')}.`)

  if (f.builder_never_say.length)
    parts.push(`لا تذكر أبداً ولا تقل: ${f.builder_never_say.join('، ')}.`)

  if (f.builder_skip_words.length)
    parts.push(`إذا كان التعليق يحتوي على: ${f.builder_skip_words.join('، ')} — فلا ترد، أو رد بأدب باختصار شديد دون تفاصيل.`)

  const validRules = f.builder_custom_rules.filter(r => r.trim())
  if (validRules.length)
    parts.push(`قواعد إضافية:\n${validRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`)

  if (!parts.length) parts.push('أنت مساعد متعاون. رد باحترافية وإيجاز.')

  return parts.join('\n\n')
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ChipInput({ label, description, chips, onChange, placeholder }: {
  label: string; description?: string
  chips: string[]; onChange: (c: string[]) => void; placeholder?: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (v && !chips.includes(v)) onChange([...chips, v])
    setInput('')
  }
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</label>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {chips.map((chip, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-full text-xs font-medium">
              {chip}
              <button type="button" onClick={() => onChange(chips.filter((_, j) => j !== i))} className="hover:text-red-500 transition leading-none">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="button" onClick={add} disabled={!input.trim()}
          className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-xl border border-gray-300 dark:border-gray-600 disabled:opacity-40 transition">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {description && <p className="text-xs text-gray-400 mt-1.5">{description}</p>}
    </div>
  )
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div onClick={() => onChange(!checked)}
        className={`relative mt-0.5 flex-shrink-0 w-10 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <div className="flex-1">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
        {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
      </div>
    </label>
  )
}

function ButtonGroup({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`px-4 py-1.5 text-sm rounded-full border transition font-medium ${value === o.value
            ? 'bg-blue-600 border-blue-600 text-white'
            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-400'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Section({ icon, title, description, children }: {
  icon: React.ReactNode; title: string; description: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AiSettingsForm({ pages, selectedPageId, initialSettings }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const [savedKeys, setSavedKeys] = useState<AiKey[]>([])
  const [hasCustomApiKey, setHasCustomApiKey] = useState(initialSettings?.has_custom_api_key ?? false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showPromptPreview, setShowPromptPreview] = useState(false)
  const statusTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [testing, setTesting] = useState(false)
  const [testComment, setTestComment] = useState('')
  const [testRecipient, setTestRecipient] = useState('')
  const [testResult, setTestResult] = useState<{ reply: string; provider: string; model: string; sent?: boolean; sendError?: string | null } | null>(null)
  const [detectingModels, setDetectingModels] = useState(false)
  const [detectedModels, setDetectedModels] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/ai-keys').then(r => r.json()).then((d: AiKey[]) => setSavedKeys(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])
  useEffect(() => () => { if (statusTimerRef.current) clearTimeout(statusTimerRef.current) }, [])

  // Detect if existing instructions look like they were manually written (not from builder)
  const isManualInstructions = !!(
    initialSettings?.reply_instructions &&
    initialSettings.reply_instructions !== 'You are a helpful assistant. Reply professionally and concisely to customer inquiries about {{business_name}}.' &&
    initialSettings.reply_instructions !== 'أنت مساعد متعاون. رد باحترافية وإيجاز.'
  )

  const defaultForm = () => ({
    // Builder fields
    builder_manual_mode: isManualInstructions,
    builder_name: '',
    builder_type: '',
    builder_offer: '',
    builder_topics: [] as string[],
    builder_never_say: initialSettings?.reply_blacklist_words ?? [] as string[],
    builder_skip_words: initialSettings?.human_handoff_keywords ?? [] as string[],
    builder_custom_rules: [''] as string[],
    // Raw instructions (used in manual mode)
    reply_instructions: initialSettings?.reply_instructions ?? '',
    // Style
    reply_language: initialSettings?.reply_language ?? 'Egyptian Arabic',
    reply_tone: PRESET_TONES.includes(initialSettings?.reply_tone ?? '') ? (initialSettings?.reply_tone ?? 'friendly') : 'custom',
    custom_tone_text: PRESET_TONES.includes(initialSettings?.reply_tone ?? '') ? '' : (initialSettings?.reply_tone ?? ''),
    reply_length: initialSettings?.reply_length ?? 'medium',
    // Public comment
    public_comment_reply_enabled: initialSettings?.public_comment_reply_enabled ?? false,
    public_comment_reply_text: initialSettings?.public_comment_reply_text ?? 'Details have been sent to your inbox 📩',
    // Handoff
    human_handoff_enabled: initialSettings?.human_handoff_enabled ?? false,
    public_comment_handoff_enabled: false,
    // Advanced
    ai_provider: initialSettings?.ai_provider ?? 'gemini',
    ai_model: initialSettings?.ai_model ?? '',
    ai_api_key: '',
    preferred_ai_key_ids: (initialSettings?.preferred_ai_key_ids as string[] | null) ?? [],
    custom_base_url: initialSettings?.custom_base_url ?? '',
    reply_delay_seconds: initialSettings?.reply_delay_seconds ?? 0,
    max_replies_per_hour: initialSettings?.max_replies_per_hour ?? 100,
    blacklisted_user_ids_raw: initialSettings?.blacklisted_user_ids?.join(', ') ?? '',
    reply_to_own_posts_only: initialSettings?.reply_to_own_posts_only ?? false,
    keyword_filter_raw: initialSettings?.keyword_filter?.join(', ') ?? '',
    review_mode_enabled: initialSettings?.review_mode_enabled ?? false,
    auto_retry_enabled: initialSettings?.auto_retry_enabled ?? true,
    max_retry_attempts: initialSettings?.max_retry_attempts ?? 3,
    public_comment_on_approval: initialSettings?.public_comment_on_approval ?? true,
    public_comment_reply_mode: initialSettings?.public_comment_reply_mode ?? 'static',
    public_comment_ai_instructions: initialSettings?.public_comment_ai_instructions ?? '',
    messaging_unavailable_reply: initialSettings?.messaging_unavailable_reply ?? 'Please send us a message on the page inbox and we will get back to you with all the details.',
  })

  const [form, setForm] = useState(defaultForm)
  useEffect(() => {
    setHasCustomApiKey(initialSettings?.has_custom_api_key ?? false)
    setForm(defaultForm())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSettings])

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }))

  const compiledPrompt = compileInstructions(form)

  const handlePageChange = (id: string) => router.push(`${pathname}?page=${id}`)

  const handleDetectModels = async () => {
    if (!selectedPageId) return
    setDetectingModels(true); setDetectedModels([])
    try {
      const res = await fetch(`/api/pages/${selectedPageId}/detect-models`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: form.ai_provider, base_url: form.custom_base_url || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDetectedModels(data.models ?? [])
      if (!data.models?.length) toast.info('No models found for this provider')
    } catch (err) { toast.error(friendlyError(err)) }
    finally { setDetectingModels(false) }
  }

  const handleRemoveApiKey = async () => {
    if (!selectedPageId) return
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/pages/${selectedPageId}/settings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_api_key: '' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setHasCustomApiKey(false); set({ ai_api_key: '' }); setSaveStatus('saved')
      toast.success('API key removed')
      statusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
      router.refresh()
    } catch (err) {
      setSaveStatus('failed'); toast.error(friendlyError(err))
      statusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPageId) return
    setSaveStatus('saving')

    const instructions = form.builder_manual_mode ? form.reply_instructions : compiledPrompt
    const neverSay = form.builder_manual_mode ? [] : form.builder_never_say
    const skipWords = form.builder_manual_mode ? [] : form.builder_skip_words
    const hasSkipWords = skipWords.length > 0

    const payload: Record<string, unknown> = {
      ai_provider: form.ai_provider,
      ai_model: form.ai_model || null,
      preferred_ai_key_ids: form.preferred_ai_key_ids,
      custom_base_url: form.custom_base_url || null,
      reply_instructions: instructions,
      reply_language: form.reply_language,
      reply_tone: form.reply_tone === 'custom' ? form.custom_tone_text.trim() || 'friendly' : form.reply_tone,
      reply_length: form.reply_length,
      reply_delay_seconds: form.reply_delay_seconds,
      max_replies_per_hour: form.max_replies_per_hour,
      keyword_filter: form.keyword_filter_raw ? form.keyword_filter_raw.split(',').map(s => s.trim()).filter(Boolean) : null,
      blacklisted_user_ids: form.blacklisted_user_ids_raw ? form.blacklisted_user_ids_raw.split(',').map(s => s.trim()).filter(Boolean) : null,
      reply_to_own_posts_only: form.reply_to_own_posts_only,
      reply_blacklist_words: neverSay.length ? neverSay : null,
      review_mode_enabled: form.review_mode_enabled,
      auto_retry_enabled: form.auto_retry_enabled,
      max_retry_attempts: form.max_retry_attempts,
      human_handoff_enabled: hasSkipWords ? true : (form.human_handoff_enabled || form.public_comment_handoff_enabled),
      human_handoff_keywords: skipWords.length ? skipWords : null,
      public_comment_reply_enabled: form.public_comment_reply_enabled,
      public_comment_reply_mode: form.public_comment_reply_mode,
      public_comment_ai_instructions: form.public_comment_ai_instructions || null,
      messaging_unavailable_reply: form.messaging_unavailable_reply,
      public_comment_reply_text: form.public_comment_reply_text,
      public_comment_on_approval: form.public_comment_on_approval,
    }

    if (form.ai_api_key?.trim()) payload.ai_api_key = form.ai_api_key.trim()

    try {
      const res = await fetch(`/api/pages/${selectedPageId}/settings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (payload.ai_api_key) { setHasCustomApiKey(true); set({ ai_api_key: '' }) }
      setSaveStatus('saved'); toast.success('Settings saved')
      statusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
      router.refresh()
    } catch (err) {
      setSaveStatus('failed'); toast.error(friendlyError(err))
      statusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }

  const handleTestReply = async () => {
    if (!selectedPageId || !testComment) return
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch(`/api/pages/${selectedPageId}/test-reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_text: testComment, recipient_id: testRecipient.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTestResult(data)
      if (data.sent) toast.success('Test DM sent successfully!')
      if (data.sendError) toast.error(`Send failed: ${data.sendError}`)
    } catch (err) { toast.error(friendlyError(err)) }
    finally { setTesting(false) }
  }

  return (
    <div className="space-y-5">
      {/* Page selector */}
      {pages.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Page</label>
          <select value={selectedPageId ?? ''} onChange={e => handlePageChange(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {pages.map(p => <option key={p.id} value={p.id}>{p.page_name}</option>)}
          </select>
        </div>
      )}

      {selectedPageId && (
        <form onSubmit={handleSave} className="space-y-5">

          {/* ── 1. AI Rules Builder ── */}
          <Section icon={<Sparkles className="w-5 h-5" />} title="AI Rules" description="Define how the AI behaves — no technical knowledge needed">

            {/* Manual / Builder toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {form.builder_manual_mode ? 'Manual mode — writing the prompt yourself' : 'Builder mode — fill in fields below'}
              </span>
              <button type="button" onClick={() => set({ builder_manual_mode: !form.builder_manual_mode })}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Switch to {form.builder_manual_mode ? 'builder' : 'manual'}
              </button>
            </div>

            {form.builder_manual_mode ? (
              /* Manual textarea */
              <div>
                <textarea value={form.reply_instructions} onChange={e => set({ reply_instructions: e.target.value })}
                  rows={6} placeholder="You are a helpful assistant for [Your Business]. When someone asks about pricing..."
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                <p className="text-xs text-gray-400 mt-1.5">Write the full AI prompt manually.</p>
              </div>
            ) : (
              /* Builder fields */
              <div className="space-y-5">

                {/* Business info */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business / Page name</label>
                    <input type="text" value={form.builder_name} onChange={e => set({ builder_name: e.target.value })}
                      placeholder="e.g. DevNxt Academy"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type of business</label>
                    <input type="text" value={form.builder_type} onChange={e => set({ builder_type: e.target.value })}
                      placeholder="e.g. online courses, clothing store, restaurant"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">What you offer</label>
                  <textarea value={form.builder_offer} onChange={e => set({ builder_offer: e.target.value })}
                    rows={2} placeholder="e.g. We teach Arabic online for beginners. Our courses run 3 months and include live sessions."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>

                {/* Topics */}
                <ChipInput
                  label="✅ Can answer questions about"
                  chips={form.builder_topics}
                  onChange={v => set({ builder_topics: v })}
                  placeholder="e.g. pricing, enrollment, schedule"
                  description="Press Enter or comma to add. Leave empty to answer everything."
                />

                {/* Never say */}
                <ChipInput
                  label="🚫 Never say or mention"
                  chips={form.builder_never_say}
                  onChange={v => set({ builder_never_say: v })}
                  placeholder="e.g. competitor names, phone numbers, exact prices"
                  description="The AI will never include these words or topics in any reply."
                />

                {/* Skip / ignore */}
                <ChipInput
                  label="⏭️ Ignore comments containing"
                  chips={form.builder_skip_words}
                  onChange={v => set({ builder_skip_words: v })}
                  placeholder="e.g. spam, giveaway, follow me"
                  description="Comments with these words will be skipped — the AI won't reply at all."
                />

                {/* Custom rules */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">📋 Custom rules</label>
                  <div className="space-y-2">
                    {form.builder_custom_rules.map((rule, i) => (
                      <div key={i} className="flex gap-2">
                        <input type="text" value={rule}
                          onChange={e => {
                            const updated = [...form.builder_custom_rules]
                            updated[i] = e.target.value
                            set({ builder_custom_rules: updated })
                          }}
                          placeholder={`Rule ${i + 1}: e.g. If asked about price, say: DM us for details`}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {form.builder_custom_rules.length > 1 && (
                          <button type="button" onClick={() => set({ builder_custom_rules: form.builder_custom_rules.filter((_, j) => j !== i) })}
                            className="px-2 text-gray-400 hover:text-red-500 transition">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => set({ builder_custom_rules: [...form.builder_custom_rules, ''] })}
                    className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Add rule
                  </button>
                </div>

                {/* Prompt preview */}
                <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                  <button type="button" onClick={() => setShowPromptPreview(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition">
                    {showPromptPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPromptPreview ? 'Hide' : 'Preview'} generated AI prompt
                  </button>
                  {showPromptPreview && (
                    <pre className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap border border-gray-200 dark:border-gray-700 font-mono leading-relaxed">
                      {compiledPrompt}
                    </pre>
                  )}
                </div>

              </div>
            )}
          </Section>

          {/* ── 2. Reply Style ── */}
          <Section icon={<MessageSquare className="w-5 h-5" />} title="Reply Style" description="How the AI sounds when it replies">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tone</label>
                <ButtonGroup value={form.reply_tone ?? 'friendly'} onChange={v => set({ reply_tone: v })}
                  options={[
                    { value: 'friendly', label: 'Friendly 😊' },
                    { value: 'professional', label: 'Professional' },
                    { value: 'formal', label: 'Formal' },
                    { value: 'casual', label: 'Casual' },
                    { value: 'custom', label: '✏️ Custom' },
                  ]}
                />
                {form.reply_tone === 'custom' && (
                  <div className="mt-3">
                    <input type="text" value={form.custom_tone_text} onChange={e => set({ custom_tone_text: e.target.value })}
                      placeholder='e.g. "warm and empathetic", "concise and direct", "enthusiastic salesperson"'
                      className="w-full px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-xs text-gray-400 mt-1">Describe the tone in your own words — the AI will follow it.</p>
                  </div>
                )}
              </div>
              <Toggle checked={form.human_handoff_enabled} onChange={v => set({ human_handoff_enabled: v })}
                label="🙋 Human handoff"
                description="When the AI isn't confident, flag the conversation so you can respond manually" />

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reply length</label>
                <ButtonGroup value={form.reply_length ?? 'medium'} onChange={v => set({ reply_length: v })}
                  options={[
                    { value: 'short', label: 'Short' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'long', label: 'Detailed' },
                  ]}
                />
              </div>
            </div>
          </Section>

          {/* ── 3. Language ── */}
          <Section icon={<Globe className="w-5 h-5" />} title="Language" description="What language should the AI reply in?">
            <select value={form.reply_language} onChange={e => set({ reply_language: e.target.value })}
              className="w-full sm:w-64 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Section>

          {/* ── 4. Public Comment ── */}
          <Section icon={<MessageSquare className="w-5 h-5" />} title="Public Comment" description="Post a short public reply on the post after sending the private message">
            <div className="space-y-4">
              <Toggle checked={form.public_comment_reply_enabled} onChange={v => set({ public_comment_reply_enabled: v })}
                label="Post a public reply on the comment"
                description={'Lets others see that you responded, e.g. "Details sent to your inbox 📩"'} />
              <Toggle checked={form.public_comment_handoff_enabled} onChange={v => set({ public_comment_handoff_enabled: v })}
                label="🙋 Handoff public comments"
                description="Flag public comments for manual review instead of posting an automated public reply" />
              {form.public_comment_reply_enabled && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">What to post publicly</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Details have been sent to your inbox 📩',
                      'Check your inbox! 📬',
                      "We've sent you the details privately 💌",
                      'تم إرسال التفاصيل برايفت 📩',
                      'تفقد رسائلك الخاصة 📬',
                    ].map(preset => (
                      <button key={preset} type="button" onClick={() => set({ public_comment_reply_text: preset })}
                        className={`px-3 py-1.5 text-xs rounded-full border transition font-medium ${form.public_comment_reply_text === preset
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400'}`}>
                        {preset}
                      </button>
                    ))}
                  </div>
                  <input type="text" value={form.public_comment_reply_text ?? ''} onChange={e => set({ public_comment_reply_text: e.target.value })}
                    placeholder="Or type your own message..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400">Click a preset to use it, or type your own.</p>
                </div>
              )}
            </div>
          </Section>

          {/* ── 5. Test ── */}
          <Section icon={<FlaskConical className="w-5 h-5" />} title="Test the AI" description="Generate a reply — optionally send it as a real DM to a Facebook user">
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="text" value={testComment} onChange={e => setTestComment(e.target.value)}
                  placeholder="Type a sample comment, e.g. كم سعر الكورس؟"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="button" onClick={handleTestReply} disabled={testing || !testComment}
                  className="px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-medium rounded-xl transition whitespace-nowrap">
                  {testing ? <><Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />Working...</> : '✨ Generate'}
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Send as real DM (optional)</label>
                <input type="text" value={testRecipient} onChange={e => setTestRecipient(e.target.value)}
                  placeholder="Facebook user ID / PSID — leave blank to preview only"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-gray-400 mt-1">Enter a Facebook user ID to actually send the generated reply via Messenger DM. You can find your own ID by commenting on your page and checking the Zernio inbox.</p>
              </div>
              {testResult && (
                <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-xs font-medium text-violet-500 dark:text-violet-400">{testResult.provider} / {testResult.model}</p>
                    {testResult.sent && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-700 px-2 py-0.5 rounded-full">
                        <Check className="w-3 h-3" /> DM Sent
                      </span>
                    )}
                    {testResult.sendError && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-700 px-2 py-0.5 rounded-full">
                        <X className="w-3 h-3" /> Send failed
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{testResult.reply}</p>
                  {testResult.sendError && (
                    <p className="text-xs text-red-500 mt-1">{testResult.sendError}</p>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* ── Advanced ── */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button type="button" onClick={() => setShowAdvanced(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition text-left">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Advanced Settings</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">AI model, rate limits, handoff</span>
              </div>
              {showAdvanced ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {showAdvanced && (
              <div className="p-6 bg-white dark:bg-gray-900 space-y-8 divide-y divide-gray-100 dark:divide-gray-800">

                {/* AI Provider */}
                <div className="space-y-5">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide pt-1">AI Provider</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Provider</label>
                      <select value={form.ai_provider} onChange={e => set({ ai_provider: e.target.value, ai_model: '', custom_base_url: '' })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {AI_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Model (optional)</label>
                      <div className="flex gap-2">
                        {detectedModels.length > 0 ? (
                          <select value={form.ai_model} onChange={e => set({ ai_model: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">-- select --</option>
                            {detectedModels.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        ) : (
                          <input type="text" value={form.ai_model} onChange={e => set({ ai_model: e.target.value })}
                            placeholder={form.ai_provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini'}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        )}
                        <button type="button" onClick={handleDetectModels} disabled={detectingModels}
                          className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 whitespace-nowrap transition">
                          {detectingModels ? '...' : 'Detect'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {form.ai_provider === 'openai-compat' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Base URL</label>
                      <input type="url" value={form.custom_base_url} onChange={e => set({ custom_base_url: e.target.value })}
                        placeholder="https://openrouter.ai/api/v1"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">API Key</label>
                      {hasCustomApiKey && (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700 px-2 py-0.5 rounded-full">
                            <Check className="w-3 h-3" /> Saved
                          </span>
                          <button type="button" onClick={handleRemoveApiKey} className="text-xs text-red-500 hover:underline">Remove</button>
                        </div>
                      )}
                    </div>
                    <input type="password" value={form.ai_api_key} onChange={e => set({ ai_api_key: e.target.value })}
                      placeholder="Leave blank to keep existing key" autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-xs text-gray-400 mt-1">Encrypted at rest. Leave blank to use the shared key pool.</p>
                  </div>

                  {savedKeys.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Allowed AI Keys</label>
                      <div className="space-y-2">
                        {savedKeys.map(k => (
                          <label key={k.id} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.preferred_ai_key_ids.includes(k.id)}
                              onChange={e => set({ preferred_ai_key_ids: e.target.checked ? [...form.preferred_ai_key_ids, k.id] : form.preferred_ai_key_ids.filter(id => id !== k.id) })}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{k.label} <span className="text-gray-400">· {k.provider}{k.model ? ` / ${k.model}` : ''}</span></span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Rate & Timing */}
                <div className="space-y-5 pt-6">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Rate & Timing</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reply delay (seconds)</label>
                      <input type="number" min={0} max={3600} value={form.reply_delay_seconds} onChange={e => set({ reply_delay_seconds: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <p className="text-xs text-gray-400 mt-1">0 = instant reply</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Max replies per hour</label>
                      <input type="number" min={1} max={1000} value={form.max_replies_per_hour} onChange={e => set({ max_replies_per_hour: parseInt(e.target.value) || 100 })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Only reply to comments containing (keyword filter)</label>
                    <input type="text" value={form.keyword_filter_raw} onChange={e => set({ keyword_filter_raw: e.target.value })}
                      placeholder="price, info, contact (leave blank = reply to all)"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Block specific users (Facebook user IDs, comma-separated)</label>
                    <input type="text" value={form.blacklisted_user_ids_raw} onChange={e => set({ blacklisted_user_ids_raw: e.target.value })}
                      placeholder="123456789, 987654321"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <Toggle checked={form.reply_to_own_posts_only} onChange={v => set({ reply_to_own_posts_only: v })}
                    label="Only reply to comments on your own posts" />
                </div>

                {/* Review & Handoff */}
                <div className="space-y-5 pt-6">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Review & Handoff</h3>
                  <Toggle checked={form.review_mode_enabled} onChange={v => set({ review_mode_enabled: v })}
                    label="Review mode" description="AI drafts the reply but waits for your approval before sending" />
                  <Toggle checked={form.auto_retry_enabled} onChange={v => set({ auto_retry_enabled: v })}
                    label="Auto-retry on failure" description="Automatically retry if sending fails" />
                  {form.auto_retry_enabled && (
                    <div className="sm:w-1/3">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Max retry attempts</label>
                      <input type="number" min={1} max={10} value={form.max_retry_attempts} onChange={e => set({ max_retry_attempts: parseInt(e.target.value) || 3 })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fallback public reply when DM is unavailable</label>
                    <input type="text" value={form.messaging_unavailable_reply} onChange={e => set({ messaging_unavailable_reply: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-xs text-gray-400 mt-1">Posted publicly when the commenter&apos;s privacy settings block direct messages.</p>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Save */}
          <div className="flex justify-end pt-1">
            <button type="submit" disabled={saveStatus === 'saving'}
              className={`inline-flex items-center justify-center gap-2 min-w-[140px] px-6 py-2.5 font-semibold rounded-xl transition shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                saveStatus === 'saved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500'
                : saveStatus === 'failed' ? 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500'
                : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white focus:ring-blue-500'}`}>
              {saveStatus === 'saving' && <><Loader2 className="w-4 h-4 animate-spin" /><span>Saving...</span></>}
              {saveStatus === 'saved' && <><Check className="w-4 h-4" /><span>Saved!</span></>}
              {saveStatus === 'failed' && <><X className="w-4 h-4" /><span>Failed</span></>}
              {saveStatus === 'idle' && <span>Save Settings</span>}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
