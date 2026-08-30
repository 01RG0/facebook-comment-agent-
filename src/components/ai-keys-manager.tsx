'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

type Health = 'healthy' | 'degraded' | 'failing'

interface AiKey {
  id: string
  label: string
  provider: string
  base_url: string | null
  model: string | null
  priority: number
  is_active: boolean
  daily_request_limit: number | null
  monthly_token_limit: number | null
  consecutive_errors: number
  last_used_at: string | null
  last_error_at: string | null
  last_error_message: string | null
  cost_per_1m_input: number
  cost_per_1m_output: number
  today_requests: number
  today_tokens_in: number
  today_tokens_out: number
  today_cost: number
  health: Health
}

interface UsageRow {
  date: string
  requests: number
  tokens_in: number
  tokens_out: number
  estimated_cost: number
}

const PROVIDERS = ['gemini', 'mistral', 'openai', 'custom'] as const
const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini', mistral: 'Mistral', openai: 'OpenAI', custom: 'Custom',
}

function HealthBadge({ health }: { health: Health }) {
  const cfg = {
    healthy: { dot: 'bg-green-500', text: 'text-green-700 dark:text-green-400', label: 'Healthy' },
    degraded: { dot: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-400', label: 'Degraded' },
    failing: { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400', label: 'Failing' },
  }[health]
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${cfg.text}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function UsageChart({ keyId }: { keyId: string }) {
  const [data, setData] = useState<UsageRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/ai-keys/${keyId}/usage`)
      .then(r => r.json())
      .then((d: UsageRow[]) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [keyId])

  if (loading) return <div className="h-32 flex items-center justify-center text-xs text-gray-400">Loading chart...</div>
  if (!data.length) return <div className="h-32 flex items-center justify-center text-xs text-gray-400">No usage data yet</div>

  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip
          formatter={(val: number, name: string) => [val.toLocaleString(), name]}
          labelFormatter={l => `Date: ${l}`}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="requests" stroke="#3b82f6" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="tokens_in" stroke="#8b5cf6" dot={false} strokeWidth={1.5} />
        <Line type="monotone" dataKey="tokens_out" stroke="#10b981" dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  )
}

const emptyForm = {
  label: '',
  provider: 'gemini' as string,
  base_url: '',
  model: '',
  api_key: '',
  daily_request_limit: '',
  monthly_token_limit: '',
  cost_per_1m_input: '',
  cost_per_1m_output: '',
}

export default function AiKeysManager() {
  const [keys, setKeys] = useState<AiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [editKey, setEditKey] = useState<AiKey | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [detectingModels, setDetectingModels] = useState(false)
  const [detectedModels, setDetectedModels] = useState<string[]>([])
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<Record<string, 'ok' | 'error'>>({})

  const handleTestKey = async (keyId: string) => {
    setTestingId(keyId)
    try {
      const res = await fetch(`/api/ai-keys/${keyId}/detect-models`, { method: 'POST' })
      const data = await res.json() as { models?: string[]; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Request failed')
      setTestStatus(s => ({ ...s, [keyId]: 'ok' }))
      toast.success(`Key works — ${data.models?.length ?? 0} model(s) available`)
    } catch (e) {
      setTestStatus(s => ({ ...s, [keyId]: 'error' }))
      toast.error(`Key failed: ${(e as Error).message}`)
    } finally {
      setTestingId(null)
    }
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-keys')
      const data = await res.json() as AiKey[]
      setKeys(data)
    } catch {
      toast.error('Failed to load keys')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const openAdd = () => {
    setEditKey(null)
    setForm(emptyForm)
    setDetectedModels([])
    setShowDialog(true)
  }

  const openEdit = (k: AiKey) => {
    setEditKey(k)
    setForm({
      label: k.label,
      provider: k.provider,
      base_url: k.base_url ?? '',
      model: k.model ?? '',
      api_key: '',
      daily_request_limit: k.daily_request_limit?.toString() ?? '',
      monthly_token_limit: k.monthly_token_limit?.toString() ?? '',
      cost_per_1m_input: k.cost_per_1m_input?.toString() ?? '',
      cost_per_1m_output: k.cost_per_1m_output?.toString() ?? '',
    })
    setDetectedModels([])
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!form.label || !form.provider) { toast.error('Label and provider are required'); return }
    if (!editKey && !form.api_key) { toast.error('API key is required'); return }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        label: form.label,
        provider: form.provider === 'custom' ? (form.base_url ? form.provider : 'custom') : form.provider,
        base_url: form.base_url || null,
        model: form.model || null,
        daily_request_limit: form.daily_request_limit ? parseInt(form.daily_request_limit) : null,
        monthly_token_limit: form.monthly_token_limit ? parseInt(form.monthly_token_limit) : null,
        cost_per_1m_input: form.cost_per_1m_input ? parseFloat(form.cost_per_1m_input) : 0,
        cost_per_1m_output: form.cost_per_1m_output ? parseFloat(form.cost_per_1m_output) : 0,
      }
      if (form.api_key) body.api_key = form.api_key

      const url = editKey ? `/api/ai-keys/${editKey.id}` : '/api/ai-keys'
      const method = editKey ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const e = await res.json() as { error: string }; throw new Error(e.error) }
      toast.success(editKey ? 'Key updated' : 'Key added')
      setShowDialog(false)
      void load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this API key?')) return
    const res = await fetch(`/api/ai-keys/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Key deleted'); void load() }
    else toast.error('Failed to delete key')
  }

  const handlePriority = async (id: string, direction: 'up' | 'down') => {
    await fetch(`/api/ai-keys/${id}/priority`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    })
    void load()
  }

  const handleDetectModels = async () => {
    if (!editKey) { toast.error('Save the key first, then detect models'); return }
    setDetectingModels(true)
    try {
      const res = await fetch(`/api/ai-keys/${editKey.id}/detect-models`, { method: 'POST' })
      const data = await res.json() as { models?: string[]; error?: string }
      if (data.error) throw new Error(data.error)
      setDetectedModels(data.models ?? [])
      if (!data.models?.length) toast.info('No models returned')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDetectingModels(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="animate-pulse h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">AI Provider Keys</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Keys are tried in priority order. On failure the next key is used automatically.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
        >
          <span className="text-base leading-none">+</span> Add Key
        </button>
      </div>

      {keys.length === 0 ? (
        <div className="px-6 py-10 text-center text-gray-500 dark:text-gray-400 text-sm">
          No API keys configured. Add a key to enable the AI agent.
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {keys.map((k, i) => (
            <div key={k.id}>
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Priority controls */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handlePriority(k.id, 'up')}
                    disabled={i === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs leading-none px-1"
                  >▲</button>
                  <button
                    onClick={() => handlePriority(k.id, 'down')}
                    disabled={i === keys.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs leading-none px-1"
                  >▼</button>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900 dark:text-white">{k.label}</span>
                    <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                      {PROVIDER_LABELS[k.provider] ?? k.provider}
                    </span>
                    {k.model && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{k.model}</span>
                    )}
                    {!k.is_active && (
                      <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded-full">Disabled</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <HealthBadge health={k.health} />
                    <span className="text-xs text-gray-400">
                      Today: {k.today_requests} req · {(k.today_tokens_in + k.today_tokens_out).toLocaleString()} tokens
                      {k.today_cost > 0 && ` · $${Number(k.today_cost).toFixed(4)}`}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => void handleTestKey(k.id)}
                    disabled={testingId === k.id}
                    className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-xs transition-colors ${
                      testingId === k.id ? 'text-gray-300' :
                      testStatus[k.id] === 'ok' ? 'text-green-500 hover:text-green-600' :
                      testStatus[k.id] === 'error' ? 'text-red-500 hover:text-red-600' :
                      'text-gray-400 hover:text-indigo-600'
                    }`}
                    title="Test key"
                  >
                    {testingId === k.id ? '⏳' : testStatus[k.id] === 'ok' ? '✅' : testStatus[k.id] === 'error' ? '❌' : '⚡'}
                  </button>
                  <button
                    onClick={() => setExpandedId(expandedId === k.id ? null : k.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-xs"
                    title="View usage chart"
                  >📊</button>
                  <button
                    onClick={() => openEdit(k)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-xs"
                    title="Edit"
                  >✏️</button>
                  <button
                    onClick={() => handleDelete(k.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-xs"
                    title="Delete"
                  >🗑️</button>
                </div>
              </div>

              {/* Expanded usage chart */}
              {expandedId === k.id && (
                <div className="px-6 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3">
                  {k.last_error_message && (
                    <div className="mb-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                      Last error: {k.last_error_message}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mb-2 font-medium">Last 30 days</div>
                  <UsageChart keyId={k.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {editKey ? 'Edit API Key' : 'Add API Key'}
              </h3>
              <button onClick={() => setShowDialog(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
                <input
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Main Key, Backup, Client"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                <select
                  value={PROVIDERS.includes(form.provider as typeof PROVIDERS[number]) ? form.provider : 'custom'}
                  onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PROVIDERS.map(p => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}
                </select>
              </div>

              {(form.provider === 'custom' || !PROVIDERS.includes(form.provider as typeof PROVIDERS[number])) && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Base URL</label>
                  <input
                    value={form.base_url}
                    onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                    placeholder="https://api.example.com"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
                <input
                  type="password"
                  value={form.api_key}
                  onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                  placeholder={editKey ? 'Leave blank to keep existing key' : 'Enter API key'}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
                <div className="flex gap-2">
                  {detectedModels.length > 0 ? (
                    <select
                      value={form.model}
                      onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Auto / default</option>
                      {detectedModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <input
                      value={form.model}
                      onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                      placeholder="e.g. gemini-1.5-pro (optional)"
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                  {editKey && (
                    <button
                      onClick={handleDetectModels}
                      disabled={detectingModels}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
                    >
                      {detectingModels ? 'Detecting...' : 'Detect Models'}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Daily Request Limit</label>
                  <input
                    type="number"
                    value={form.daily_request_limit}
                    onChange={e => setForm(f => ({ ...f, daily_request_limit: e.target.value }))}
                    placeholder="Unlimited"
                    min={1}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Monthly Token Limit</label>
                  <input
                    type="number"
                    value={form.monthly_token_limit}
                    onChange={e => setForm(f => ({ ...f, monthly_token_limit: e.target.value }))}
                    placeholder="Unlimited"
                    min={1}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Cost / 1M Input Tokens ($)</label>
                  <input
                    type="number"
                    value={form.cost_per_1m_input}
                    onChange={e => setForm(f => ({ ...f, cost_per_1m_input: e.target.value }))}
                    placeholder="0.00"
                    step="0.01"
                    min={0}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Cost / 1M Output Tokens ($)</label>
                  <input
                    type="number"
                    value={form.cost_per_1m_output}
                    onChange={e => setForm(f => ({ ...f, cost_per_1m_output: e.target.value }))}
                    placeholder="0.00"
                    step="0.01"
                    min={0}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowDialog(false)}
                  className="flex-1 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition"
                >
                  {saving ? 'Saving...' : editKey ? 'Save Changes' : 'Add Key'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
