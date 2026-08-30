'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import Image from 'next/image'
import JSZip from 'jszip'

interface Asset {
  id: string
  label: string
  description: string | null
  tags: string[]
  file_url: string
  file_type: string
  created_at: string
}

interface ManifestAsset {
  file: string
  label: string
  description?: string
  tags?: string[]
}

interface Manifest {
  version: string
  name?: string
  assets: ManifestAsset[]
}

interface Props {
  pageId: string
}

export default function KnowledgeBasePanel({ pageId }: Props) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; label: string } | null>(null)
  const [form, setForm] = useState({ label: '', description: '', tags: '' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ label: '', description: '', tags: '' })
  const [savingId, setSavingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/pages/${pageId}/assets`)
      .then(r => r.json())
      .then(data => setAssets(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [pageId])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    if (file?.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file))
    } else {
      setPreview(null)
    }
  }

  const uploadOne = async (file: File, label: string, description: string, tags: string[]): Promise<Asset | null> => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('label', label)
    fd.append('description', description)
    fd.append('tags', tags.join(','))
    const res = await fetch(`/api/pages/${pageId}/assets`, { method: 'POST', body: fd })
    if (!res.ok) throw new Error((await res.json()).error)
    return res.json()
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile || !form.label.trim()) return
    setUploading(true)
    try {
      const asset = await uploadOne(
        selectedFile,
        form.label.trim(),
        form.description.trim(),
        form.tags.split(',').map(t => t.trim()).filter(Boolean)
      )
      if (asset) setAssets(a => [asset, ...a])
      setForm({ label: '', description: '', tags: '' })
      setSelectedFile(null)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      toast.success('Image uploaded to knowledge base')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (zipRef.current) zipRef.current.value = ''

    setImporting(true)
    setImportProgress(null)

    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer())

      // Find manifest.json anywhere in the zip
      const manifestEntry = zip.file('manifest.json') ?? zip.file(/manifest\.json$/)[0]
      if (!manifestEntry) throw new Error('No manifest.json found in ZIP')

      const manifest: Manifest = JSON.parse(await manifestEntry.async('string'))
      if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
        throw new Error('manifest.json has no assets')
      }

      const added: Asset[] = []
      let failed = 0

      for (let i = 0; i < manifest.assets.length; i++) {
        const item = manifest.assets[i]
        setImportProgress({ current: i + 1, total: manifest.assets.length, label: item.label })

        // Find the file in the zip (search by filename, ignoring folder prefix)
        const entry = zip.file(item.file) ?? zip.file(new RegExp(`(^|/)${item.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))[0]
        if (!entry) {
          toast.error(`File not found in ZIP: ${item.file}`)
          failed++
          continue
        }

        const blob = await entry.async('blob')
        const mimeType = item.file.endsWith('.png') ? 'image/png'
          : item.file.endsWith('.webp') ? 'image/webp'
          : item.file.endsWith('.gif') ? 'image/gif'
          : 'image/jpeg'
        const imageFile = new File([blob], item.file, { type: mimeType })

        try {
          const asset = await uploadOne(
            imageFile,
            item.label,
            item.description ?? '',
            item.tags ?? []
          )
          if (asset) added.push(asset)
        } catch (err) {
          toast.error(`Failed to upload ${item.label}: ${(err as Error).message}`)
          failed++
        }
      }

      setAssets(a => [...added.reverse(), ...a])

      const name = manifest.name ? `"${manifest.name}"` : 'template'
      if (failed === 0) {
        toast.success(`${added.length} image${added.length !== 1 ? 's' : ''} imported from ${name}`)
      } else {
        toast.warning(`${added.length} imported, ${failed} failed from ${name}`)
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const startEdit = (asset: Asset) => {
    setEditingId(asset.id)
    setEditForm({
      label: asset.label,
      description: asset.description ?? '',
      tags: (asset.tags ?? []).join(', '),
    })
  }

  const handleSaveEdit = async (id: string) => {
    setSavingId(id)
    try {
      const res = await fetch(`/api/pages/${pageId}/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editForm.label.trim(),
          description: editForm.description.trim(),
          tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const updated: Asset = await res.json()
      setAssets(a => a.map(x => x.id === id ? updated : x))
      setEditingId(null)
      toast.success('Saved')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/pages/${pageId}/assets/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      setAssets(a => a.filter(x => x.id !== id))
      toast.success('Removed from knowledge base')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">🗂️ Knowledge Base</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Upload schedule images and flyers. The AI reads the labels and tags, and attaches the right image to private replies when relevant.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Download template */}
          <a
            href="/templates/osama-saadallah-template.zip"
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 rounded-lg transition"
          >
            ⬇ Download Template
          </a>
          {/* Import ZIP */}
          <button
            type="button"
            onClick={() => zipRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-lg transition disabled:opacity-50"
          >
            📦 {importing ? 'Importing...' : 'Import ZIP'}
          </button>
          <input ref={zipRef} type="file" accept=".zip" className="hidden" onChange={handleZipImport} />
        </div>
      </div>

      {/* Import progress */}
      {importProgress && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-xs text-blue-700 dark:text-blue-300 mb-1.5">
            <span>Uploading {importProgress.current} of {importProgress.total}</span>
            <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all"
              style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 truncate">{importProgress.label}</p>
        </div>
      )}

      {/* Manual upload form */}
      <form onSubmit={handleUpload} className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Add single image</p>
        <div className="flex gap-3 items-start">
          <div className="shrink-0">
            <div
              className="w-20 h-20 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center cursor-pointer overflow-hidden"
              onClick={() => fileRef.current?.click()}
            >
              {preview ? (
                <Image src={preview} alt="preview" width={80} height={80} className="w-full h-full object-cover" unoptimized />
              ) : (
                <span className="text-2xl">📎</span>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <p className="text-xs text-gray-400 mt-1 text-center">click to pick</p>
          </div>
          <div className="flex-1 space-y-2">
            <input
              type="text"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="Label — e.g. جدول تالتة ثانوي إحصاء"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description (optional) — what's in this image"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="Tags (comma-separated): مواعيد, إحصاء, تالتة ثانوي"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={uploading || !selectedFile || !form.label.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition"
        >
          {uploading ? 'Uploading...' : 'Upload Image'}
        </button>
      </form>

      {/* Asset list */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : assets.length === 0 ? (
        <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
          <p className="text-2xl mb-2">🗂️</p>
          <p>No images yet.</p>
          <p className="text-xs mt-1">Download the template ZIP and import it, or add images manually above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {assets.length} image{assets.length !== 1 ? 's' : ''} in knowledge base
          </p>
          {assets.map(asset => (
            <div key={asset.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
              {editingId === asset.id ? (
                /* ── Edit mode ── */
                <div className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 shrink-0 rounded overflow-hidden border border-gray-300 dark:border-gray-600">
                      <Image src={asset.file_url} alt={asset.label} width={40} height={40} className="w-full h-full object-cover" unoptimized />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Editing metadata — image stays the same</span>
                  </div>
                  <input
                    type="text"
                    value={editForm.label}
                    onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="Label"
                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Description"
                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={editForm.tags}
                    onChange={e => setEditForm(f => ({ ...f, tags: e.target.value }))}
                    placeholder="Tags (comma-separated)"
                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(asset.id)}
                      disabled={savingId === asset.id || !editForm.label.trim()}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-medium rounded-lg transition"
                    >
                      {savingId === asset.id ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div className="flex items-start gap-3 p-3">
                  <div className="w-14 h-14 shrink-0 rounded overflow-hidden border border-gray-300 dark:border-gray-600">
                    {asset.file_type === 'image' ? (
                      <Image src={asset.file_url} alt={asset.label} width={56} height={56} className="w-full h-full object-cover" unoptimized />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">📄</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{asset.label}</p>
                    {asset.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{asset.description}</p>
                    )}
                    {asset.tags && asset.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {asset.tags.map(tag => (
                          <span key={tag} className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(asset)}
                      className="text-xs text-gray-400 hover:text-blue-500 transition"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(asset.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
