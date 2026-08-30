'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import Image from 'next/image'

interface Asset {
  id: string
  label: string
  description: string | null
  tags: string[]
  file_url: string
  file_type: string
  created_at: string
}

interface Props {
  pageId: string
}

export default function KnowledgeBasePanel({ pageId }: Props) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({ label: '', description: '', tags: '' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setPreview(url)
    } else {
      setPreview(null)
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile || !form.label.trim()) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', selectedFile)
      fd.append('label', form.label.trim())
      fd.append('description', form.description.trim())
      fd.append('tags', form.tags)
      const res = await fetch(`/api/pages/${pageId}/assets`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json()).error)
      const asset: Asset = await res.json()
      setAssets(a => [asset, ...a])
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
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-white">🗂️ Knowledge Base</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Upload images (schedules, flyers, price lists) the AI can attach to private replies.
          Add a clear label and tags so the AI knows when to include each one.
        </p>
      </div>

      {/* Upload form */}
      <form onSubmit={handleUpload} className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Add image</p>

        <div className="flex gap-3 items-start">
          {/* File picker + preview */}
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
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <p className="text-xs text-gray-400 mt-1 text-center">click to pick</p>
          </div>

          {/* Fields */}
          <div className="flex-1 space-y-2">
            <input
              type="text"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="Label, e.g. جدول تالتة ثانوي إحصاء"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description (optional) — helps the AI decide when to send it"
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
          {uploading ? 'Uploading...' : 'Upload to Knowledge Base'}
        </button>
      </form>

      {/* Asset list */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : assets.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No images yet. Upload your first schedule or flyer above.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{assets.length} image{assets.length !== 1 ? 's' : ''} in knowledge base</p>
          {assets.map(asset => (
            <div key={asset.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
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
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{asset.description}</p>
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
              <button
                type="button"
                onClick={() => handleDelete(asset.id)}
                className="text-xs text-gray-400 hover:text-red-500 transition shrink-0 mt-0.5"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
