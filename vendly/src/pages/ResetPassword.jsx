import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function ResetPassword() {
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

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
      setMessage(error.message)
      setLoading(false)
      return
    }

    setMessage('Password updated successfully. You can now log in.')
    setPassword('')
    setConfirmPassword('')
    setLoading(false)

    setTimeout(() => {
      navigate('/')
    }, 1200)
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-[410px]">
        <h1 className="text-4xl font-bold mb-2">Reset Password</h1>

        <p className="text-gray-400 mb-8">
          Create a new password for your Vendly account.
        </p>

        <input
          placeholder="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-4 mb-3 rounded-xl bg-[#111] border border-[#333] text-white text-base outline-none"
        />

        <input
          placeholder="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full p-4 mb-3 rounded-xl bg-[#111] border border-[#333] text-white text-base outline-none"
        />

        <div className="mb-5 rounded-xl border border-[#222] bg-[#111] p-3 space-y-1">
          <PasswordRequirement met={passwordChecks.length} label="At least 8 characters" />
          <PasswordRequirement met={passwordChecks.uppercase} label="One uppercase letter" />
          <PasswordRequirement met={passwordChecks.lowercase} label="One lowercase letter" />
          <PasswordRequirement met={passwordChecks.number} label="One number" />
          <PasswordRequirement met={passwordChecks.special} label="One special character" />
        </div>

        <button
          onClick={handleUpdatePassword}
          disabled={loading || !passwordIsValid}
          className="w-full p-4 rounded-xl bg-white text-black font-semibold text-base mb-3 disabled:opacity-60"
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>

        <button
          onClick={() => navigate('/')}
          disabled={loading}
          className="w-full p-4 rounded-xl bg-[#111] border border-[#333] text-white font-semibold text-base disabled:opacity-60"
        >
          Back to Log In
        </button>

        {message && (
          <p className={`mt-5 rounded-xl border p-3 text-center text-sm font-bold ${getMessageClasses()}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}

export default ResetPassword
