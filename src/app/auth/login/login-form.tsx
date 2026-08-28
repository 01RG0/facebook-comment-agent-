'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

type Mode = 'login' | 'signup' | 'reset'

export default function LoginForm() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      })
      setLoading(false)
      if (error) toast.error(error.message)
      else setResetSent(true)
      return
    }

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      setLoading(false)
      if (error) toast.error(error.message)
      else toast.success('Account created! Check your email to confirm.')
      return
    }

    // login
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) toast.error(error.message)
    else window.location.href = '/dashboard'
  }

  if (resetSent) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
        <div className="text-4xl mb-4">📧</div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Check your email</h2>
        <p className="text-gray-600 dark:text-gray-400">Password reset link sent to <span className="font-medium text-blue-600">{email}</span></p>
        <button onClick={() => { setResetSent(false); setMode('login') }} className="mt-4 text-sm text-blue-600 hover:underline">
          Back to login
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 text-center">
        {mode === 'login' ? 'Sign in to your account' : mode === 'signup' ? 'Create an account' : 'Reset password'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email address"
          required
          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
        />
        {mode !== 'reset' && (
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        )}
        <button
          type="submit"
          disabled={loading || !email || (mode !== 'reset' && !password)}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {loading ? '...' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
        </button>
      </form>

      <div className="mt-4 flex justify-between text-sm text-gray-500 dark:text-gray-400">
        {mode === 'login' ? (
          <>
            <button onClick={() => setMode('signup')} className="hover:text-blue-600 hover:underline">Create account</button>
            <button onClick={() => setMode('reset')} className="hover:text-blue-600 hover:underline">Forgot password?</button>
          </>
        ) : (
          <button onClick={() => setMode('login')} className="hover:text-blue-600 hover:underline">Back to sign in</button>
        )}
      </div>
    </div>
  )
}
