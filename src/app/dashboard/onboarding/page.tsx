'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const STEPS = ['Connect Page', 'Configure AI', 'Go Live']

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [pages, setPages] = useState<{ id: string; page_name: string; fb_page_id: string }[]>([])
  const [selectedPage, setSelectedPage] = useState('')
  const [instructions, setInstructions] = useState('You are a helpful assistant for this Facebook page. Reply warmly and concisely to comments using the same language as the commenter.')
  const [provider, setProvider] = useState('gemini')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/pages')
      .then(r => r.json())
      .then(data => {
        if (data.pages?.length) {
          setPages(data.pages)
          setSelectedPage(data.pages[0].id)
          setStep(1)
        }
      })
      .catch(() => {})
  }, [])

  const pollForPages = async () => {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const res = await fetch('/api/pages')
      const data = await res.json()
      if (data.pages?.length) {
        setPages(data.pages)
        setSelectedPage(data.pages[0].id)
        setStep(1)
        return
      }
    }
    toast.error('No pages found — make sure you have a Facebook Page and try again')
  }

  const handleConnect = () => {
    window.open('/api/facebook/connect', '_self')
    pollForPages()
  }

  const handleSaveSettings = async () => {
    if (!selectedPage) return
    setSaving(true)
    const res = await fetch(`/api/pages/${selectedPage}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reply_instructions: instructions,
        ai_provider: provider,
        ...(apiKey ? { ai_api_key: apiKey } : {}),
      }),
    })
    setSaving(false)
    if (res.ok) {
      setStep(2)
    } else {
      toast.error('Failed to save settings')
    }
  }

  const handleEnable = async () => {
    if (!selectedPage) return
    setEnabling(true)
    const res = await fetch(`/api/pages/${selectedPage}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })
    setEnabling(false)
    if (res.ok) {
      setDone(true)
    } else {
      toast.error('Failed to enable agent')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Step indicators */}
        <div className="flex items-center justify-center mb-8 gap-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-colors ${
                i < step ? 'bg-green-500 text-white' :
                i === step ? 'bg-blue-600 text-white' :
                'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-sm hidden sm:block ${i === step ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-300 dark:bg-gray-600 mx-1" />}
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">

          {/* Step 0: Connect */}
          {step === 0 && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Connect your Facebook Page</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  The agent monitors comments on your page and automatically sends private replies using AI. Connect your page to get started.
                </p>
              </div>
              <button
                onClick={handleConnect}
                className="w-full py-3 px-6 bg-[#1877F2] hover:bg-[#1565D8] text-white font-semibold rounded-xl transition"
              >
                Connect Facebook Page
              </button>
              <p className="text-xs text-gray-400">You&apos;ll be redirected to Facebook to authorize access</p>
            </div>
          )}

          {/* Step 1: Configure AI */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Configure AI replies</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Tell the AI how to respond to your audience.</p>
              </div>

              {pages.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Page</label>
                  <select
                    value={selectedPage}
                    onChange={e => setSelectedPage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {pages.map(p => <option key={p.id} value={p.id}>{p.page_name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reply instructions</label>
                <textarea
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">AI Provider</label>
                <select
                  value={provider}
                  onChange={e => setProvider(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="mistral">Mistral AI</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  API Key <span className="text-gray-400 font-normal">(optional — skip if using Admin keys)</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-... or AI..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-xl transition"
              >
                {saving ? 'Saving...' : 'Save & Continue'}
              </button>
            </div>
          )}

          {/* Step 2: Enable */}
          {step === 2 && !done && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Ready to go live!</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Enable the agent to start automatically replying to comments on <span className="font-medium text-gray-700 dark:text-gray-300">{pages.find(p => p.id === selectedPage)?.page_name}</span>.
                </p>
              </div>
              <button
                onClick={handleEnable}
                disabled={enabling}
                className="w-full py-3 px-6 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold rounded-xl transition"
              >
                {enabling ? 'Enabling...' : '🚀 Enable Agent'}
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* Done */}
          {done && (
            <div className="text-center space-y-6">
              <div className="text-5xl">🎉</div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Your agent is live!</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  The AI will now automatically reply to new comments on your page. You can monitor activity and adjust settings from the dashboard.
                </p>
              </div>
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
