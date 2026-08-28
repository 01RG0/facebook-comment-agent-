'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Provider {
  id: string
  name: string
  display_name: string
  provider_type: string
  base_url: string | null
  default_model: string | null
  is_enabled: boolean
  sort_order: number
  created_at: string
}

const EMPTY_FORM = {
  name: '',
  display_name: '',
  provider_type: 'openai-compat',
  base_url: '',
  default_model: '',
  api_key: '',
  sort_order: '0',
  is_enabled: true,
}

type ProviderForm = typeof EMPTY_FORM

export default function AdminProvidersPanel() {
  const { data: providers, isLoading, mutate } = useSWR<Provider[]>('/api/admin/providers', fetcher)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditId(null)
    setShowForm(true)
  }

  const openEdit = (p: Provider) => {
    setForm({
      name: p.name,
      display_name: p.display_name,
      provider_type: p.provider_type,
      base_url: p.base_url ?? '',
      default_model: p.default_model ?? '',
      api_key: '',
      sort_order: p.sort_order.toString(),
      is_enabled: p.is_enabled,
    })
    setEditId(p.id)
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditId(null) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.display_name) { toast.error('Name and display name are required'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.toLowerCase().replace(/\s+/g, '-'),
        display_name: form.display_name,
        provider_type: form.provider_type,
        base_url: form.base_url || null,
        default_model: form.default_model || null,
        api_key: form.api_key || undefined,
        sort_order: parseInt(form.sort_order) || 0,
        is_enabled: form.is_enabled,
      }
      const url = editId ? `/api/admin/providers/${editId}` : '/api/admin/providers'
      const method = editId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(editId ? 'Provider updated' : 'Provider created')
      mutate()
      closeForm()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const deleteProvider = async (id: string, name: string) => {
    if (!confirm(`Delete provider "${name}"? Any existing settings using it may break.`)) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/providers/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Provider deleted')
      mutate()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  const toggleEnabled = async (p: Provider) => {
    const res = await fetch(`/api/admin/providers/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: !p.is_enabled }),
    })
    if (res.ok) mutate()
    else toast.error('Failed to update')
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Providers</h1>
          <p className="text-gray-400 mt-1 text-sm">Manage custom AI providers available to users</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
        >
          + Add Provider
        </button>
      </div>

      {/* Built-in providers info */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500">
          <span className="text-gray-400 font-medium">Built-in providers:</span> gemini, mistral, openai — always available.
          Custom providers below use the OpenAI-compatible API format and appear alongside built-ins in user settings.
        </p>
      </div>

      {/* Provider list */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {(providers ?? []).length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <p className="text-lg mb-1">No custom providers yet</p>
            <p className="text-sm">Add a provider to make it available to users</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {(providers ?? []).map(p => (
              <div key={p.id} className="px-5 py-4 flex items-center gap-4">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.is_enabled ? 'bg-green-500' : 'bg-gray-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white text-sm">{p.display_name}</span>
                    <span className="text-xs text-gray-500 font-mono bg-gray-800 px-1.5 py-0.5 rounded">{p.name}</span>
                    <span className="text-xs text-gray-600">{p.provider_type}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                    {p.base_url && <span className="truncate max-w-xs">{p.base_url}</span>}
                    {p.default_model && <span>model: {p.default_model}</span>}
                    <span>order: {p.sort_order}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleEnabled(p)}
                    className={`text-xs px-2 py-1 rounded transition ${p.is_enabled ? 'text-green-400 hover:text-yellow-400 hover:bg-gray-800' : 'text-gray-500 hover:text-green-400 hover:bg-gray-800'}`}
                  >
                    {p.is_enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => openEdit(p)}
                    className="text-xs text-gray-400 hover:text-white transition px-2 py-1 rounded hover:bg-gray-800"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteProvider(p.id, p.display_name)}
                    disabled={deleting === p.id}
                    className="text-xs text-gray-600 hover:text-red-400 transition px-2 py-1 rounded hover:bg-gray-800"
                  >
                    {deleting === p.id ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-semibold text-white">{editId ? 'Edit Provider' : 'Add Custom Provider'}</h2>
              <button onClick={closeForm} className="text-gray-500 hover:text-white transition">✕</button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Internal Name <span className="text-red-400">*</span></label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="my-llm-provider"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Display Name <span className="text-red-400">*</span></label>
                  <input
                    value={form.display_name}
                    onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                    placeholder="My LLM Provider"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Provider Type</label>
                <select
                  value={form.provider_type}
                  onChange={e => setForm(f => ({ ...f, provider_type: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="openai-compat">OpenAI-Compatible</option>
                </select>
                <p className="text-xs text-gray-600 mt-1">All custom providers use the OpenAI-compatible API format</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Base URL</label>
                <input
                  value={form.base_url}
                  onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                  placeholder="https://api.example.com/v1"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Default Model</label>
                <input
                  value={form.default_model}
                  onChange={e => setForm(f => ({ ...f, default_model: e.target.value }))}
                  placeholder="gpt-4o-mini"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  API Key {editId && <span className="text-gray-600">(leave blank to keep existing)</span>}
                </label>
                <input
                  type="password"
                  value={form.api_key}
                  onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                  placeholder={editId ? '••••••••••••••••' : 'sk-...'}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-600 mt-1">Stored encrypted at rest using AES-256-GCM</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_enabled}
                      onChange={e => setForm(f => ({ ...f, is_enabled: e.target.checked }))}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-300">Enabled</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-sm font-medium rounded-lg transition"
                >
                  {saving ? 'Saving...' : editId ? 'Save Changes' : 'Create Provider'}
                </button>
                <button type="button" onClick={closeForm} className="px-4 py-2 text-gray-400 hover:text-white text-sm transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
