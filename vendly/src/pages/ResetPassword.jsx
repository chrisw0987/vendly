import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function ResetPassword() {
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [checkingRecovery, setCheckingRecovery] = useState(true)
  const [recoveryReady, setRecoveryReady] = useState(false)

  const passwordChecks = useMemo(
    () => ({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    }),
    [password]
  )

  const passwordIsValid = Object.values(passwordChecks).every(Boolean)

  useEffect(() => {
    let mounted = true

    const initialUrl = new URL(window.location.href)
    const hashParams = new URLSearchParams(
      initialUrl.hash.startsWith('#')
        ? initialUrl.hash.slice(1)
        : initialUrl.hash
    )

    const arrivedFromRecoveryLink =
      initialUrl.searchParams.has('code') ||
      initialUrl.searchParams.get('type') === 'recovery' ||
      hashParams.get('type') === 'recovery' ||
      hashParams.has('access_token')

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (event === 'PASSWORD_RECOVERY' && session) {
        setRecoveryReady(true)
        setCheckingRecovery(false)
      }
    })

    async function verifyRecoverySession() {
      await new Promise((resolve) => setTimeout(resolve, 250))

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      if (!mounted) return

      if (error) {
        console.error('Recovery session check failed:', error)
        setRecoveryReady(false)
        setCheckingRecovery(false)
        return
      }

      setRecoveryReady(Boolean(session && arrivedFromRecoveryLink))
      setCheckingRecovery(false)
    }

    verifyRecoverySession()

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  function PasswordRequirement({ met, label }) {
    return (
      <p className={`text-xs ${met ? 'text-green-300' : 'text-gray-500'}`}>
        {met ? '✓' : '○'} {label}
      </p>
    )
  }

  function getMessageClasses() {
    const lower = message.toLowerCase()

    if (lower.includes('updated') || lower.includes('success')) {
      return 'border-green-900 bg-green-950/40 text-green-300'
    }

    return 'border-red-900 bg-red-950/40 text-red-300'
  }

  async function handleUpdatePassword() {
    if (!recoveryReady) {
      setMessage(
        'This password reset link is invalid or has expired. Please request a new one.'
      )
      return
    }

    setLoading(true)
    setMessage('')

    if (!passwordIsValid) {
      setMessage(
        'Password must include at least 8 characters, uppercase, lowercase, number, and special character.'
      )
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({
      password,
    })

    if (error) {
      console.error('Password update failed:', error)
      setMessage(
        'This password reset link is invalid or has expired. Please request a new one.'
      )
      setLoading(false)
      return
    }

    setMessage('Password updated successfully. You can now log in.')
    setPassword('')
    setConfirmPassword('')
    setLoading(false)

    setTimeout(async () => {
      await supabase.auth.signOut()
      navigate('/')
    }, 1200)
  }

  if (checkingRecovery) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="w-full max-w-[410px] text-center">
          <p className="text-sm text-gray-400">
            Checking password reset link...
          </p>
        </div>
      </div>
    )
  }

  if (!recoveryReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="w-full max-w-[410px]">
          <h1 className="mb-2 text-4xl font-bold">Reset Password</h1>

          <p className="mb-6 text-gray-400">
            This password reset link is invalid, expired, or was not opened from
            your reset email.
          </p>

          <div className="mb-5 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm font-semibold text-red-300">
            Please return to the login page and request a new password reset
            email.
          </div>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full rounded-xl bg-white p-4 text-base font-semibold text-black"
          >
            Back to Log In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-[410px]">
        <h1 className="mb-2 text-4xl font-bold">Reset Password</h1>

        <p className="mb-8 text-gray-400">
          Create a new password for your Vendly account.
        </p>

        <input
          placeholder="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-3 w-full rounded-xl border border-[#333] bg-[#111] p-4 text-base text-white outline-none"
        />

        <input
          placeholder="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mb-3 w-full rounded-xl border border-[#333] bg-[#111] p-4 text-base text-white outline-none"
        />

        <div className="mb-5 space-y-1 rounded-xl border border-[#222] bg-[#111] p-3">
          <PasswordRequirement
            met={passwordChecks.length}
            label="At least 8 characters"
          />
          <PasswordRequirement
            met={passwordChecks.uppercase}
            label="One uppercase letter"
          />
          <PasswordRequirement
            met={passwordChecks.lowercase}
            label="One lowercase letter"
          />
          <PasswordRequirement met={passwordChecks.number} label="One number" />
          <PasswordRequirement
            met={passwordChecks.special}
            label="One special character"
          />
        </div>

        <button
          type="button"
          onClick={handleUpdatePassword}
          disabled={loading || !passwordIsValid}
          className="mb-3 w-full rounded-xl bg-white p-4 text-base font-semibold text-black disabled:opacity-60"
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          disabled={loading}
          className="w-full rounded-xl border border-[#333] bg-[#111] p-4 text-base font-semibold text-white disabled:opacity-60"
        >
          Back to Log In
        </button>

        {message && (
          <p
            className={`mt-5 rounded-xl border p-3 text-center text-sm font-bold ${getMessageClasses()}`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  )
}

export default ResetPassword