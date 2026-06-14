import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function Login() {
  const navigate = useNavigate()

  const [mode, setMode] = useState('login') // login, signup, forgot
  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [resetEmail, setResetEmail] = useState('')
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

  function getMessageClasses() {
    const lower = message.toLowerCase()

    if (
      lower.includes('created') ||
      lower.includes('success') ||
      lower.includes('log in') ||
      lower.includes('sent') ||
      lower.includes('check your email')
    ) {
      return 'border-green-900 bg-green-950/40 text-green-300'
    }

    return 'border-red-900 bg-red-950/40 text-red-300'
  }

  function PasswordRequirement({ met, label }) {
    return (
      <p className={`text-xs ${met ? 'text-green-300' : 'text-gray-500'}`}>
        {met ? '✓' : '○'} {label}
      </p>
    )
  }

  function resetForm(newMode) {
    setMode(newMode)
    setMessage('')
    setPassword('')
    setConfirmPassword('')

    if (newMode === 'forgot') {
      setResetEmail(loginIdentifier.includes('@') ? loginIdentifier : email)
    }
  }

  async function getEmailFromUsername(identifier) {
    const cleanIdentifier = identifier.trim()

    if (cleanIdentifier.includes('@')) {
      return cleanIdentifier.toLowerCase()
    }

    const { data, error } = await supabase
      .from('users')
      .select('display_name')
      .eq('username', cleanIdentifier)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    if (!data?.display_name) {
      throw new Error("This user doesn't exist. Please sign up.")
    }

    return data.display_name
  }

  async function handleLogin() {
    setLoading(true)
    setMessage('')

    if (!loginIdentifier.trim()) {
      setMessage('Please enter your email or username.')
      setLoading(false)
      return
    }

    if (!password) {
      setMessage('Please enter your password.')
      setLoading(false)
      return
    }

    try {
      const loginEmail = await getEmailFromUsername(loginIdentifier)

      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      })

      if (error) {
        if (error.message.toLowerCase().includes('invalid login credentials')) {
          setMessage(
            "This user doesn't exist or the password is incorrect. Please sign up if you don't have an account."
          )
        } else {
          setMessage(error.message)
        }

        setLoading(false)
        return
      }

      navigate('/dashboard')
    } catch (err) {
      setMessage(err.message)
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    setLoading(true)
    setMessage('')

    const cleanEmail = resetEmail.trim().toLowerCase()

    if (!cleanEmail) {
      setMessage('Please enter the email linked to your account.')
      setLoading(false)
      return
    }

    if (!cleanEmail.includes('@')) {
      setMessage('Password reset requires your email address, not your username.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setMessage('Password reset email sent. Check your email.')
    setLoading(false)
  }

  async function handleSignUp() {
    setLoading(true)
    setMessage('')

    const cleanUsername = username.trim()
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanUsername) {
      setMessage('Please enter a username.')
      setLoading(false)
      return
    }

    if (!cleanEmail) {
      setMessage('Please enter an email address.')
      setLoading(false)
      return
    }

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

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    const user = data.user

    if (user) {
      const { error: userError } = await supabase.from('users').upsert({
        id: user.id,
        display_name: cleanEmail,
        username: cleanUsername,
        account_type: 'user',
      })

      if (userError) {
        if (userError.message.toLowerCase().includes('duplicate')) {
          setMessage('That username is already taken.')
        } else {
          setMessage(userError.message)
        }

        setLoading(false)
        return
      }
    }

    setMessage('Account created. You can now log in.')
    setMode('login')
    setLoginIdentifier(cleanUsername)
    setPassword('')
    setConfirmPassword('')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-[410px]">
        <h1 className="text-5xl font-bold mb-2">Vendly</h1>

        <p className="text-gray-400 mb-8">
          Inventory and discovery for card shows.
        </p>

        {mode === 'login' ? (
          <>
            <input
              placeholder="Email or username"
              type="text"
              value={loginIdentifier}
              onChange={(e) => setLoginIdentifier(e.target.value)}
              className="w-full p-4 mb-4 rounded-xl bg-[#111] border border-[#333] text-white text-base outline-none"
            />

            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 mb-3 rounded-xl bg-[#111] border border-[#333] text-white text-base outline-none"
            />

            <button
              type="button"
              onClick={() => resetForm('forgot')}
              disabled={loading}
              className="mb-5 text-sm font-semibold text-yellow-300 hover:underline disabled:opacity-60"
            >
              Forgot password?
            </button>

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full p-4 rounded-xl bg-white text-black font-semibold text-base mb-3 disabled:opacity-60"
            >
              {loading ? 'Loading...' : 'Log In'}
            </button>

            <button
              onClick={() => resetForm('signup')}
              disabled={loading}
              className="w-full p-4 rounded-xl bg-[#111] border border-[#333] text-white font-semibold text-base disabled:opacity-60"
            >
              Create Account
            </button>
          </>
        ) : mode === 'forgot' ? (
          <>
            <p className="mb-5 rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-gray-400">
              Enter the email linked to your account. We’ll send you a password reset link.
            </p>

            <input
              placeholder="Email address"
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="w-full p-4 mb-5 rounded-xl bg-[#111] border border-[#333] text-white text-base outline-none"
            />

            <button
              onClick={handleForgotPassword}
              disabled={loading}
              className="w-full p-4 rounded-xl bg-white text-black font-semibold text-base mb-3 disabled:opacity-60"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <button
              onClick={() => resetForm('login')}
              disabled={loading}
              className="w-full p-4 rounded-xl bg-[#111] border border-[#333] text-white font-semibold text-base disabled:opacity-60"
            >
              Back to Log In
            </button>
          </>
        ) : (
          <>
            <p className="mb-5 rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-gray-400">
              Create a free account to save shows and track your collection. You can apply to become a vendor from the Shows page after signup.
            </p>

            <input
              placeholder="Username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-4 mb-4 rounded-xl bg-[#111] border border-[#333] text-white text-base outline-none"
            />

            <input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 mb-4 rounded-xl bg-[#111] border border-[#333] text-white text-base outline-none"
            />

            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 mb-3 rounded-xl bg-[#111] border border-[#333] text-white text-base outline-none"
            />

            <input
              placeholder="Confirm password"
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
              onClick={handleSignUp}
              disabled={loading || !passwordIsValid}
              className="w-full p-4 rounded-xl bg-white text-black font-semibold text-base mb-3 disabled:opacity-60"
            >
              {loading ? 'Loading...' : 'Sign Up'}
            </button>

            <button
              onClick={() => resetForm('login')}
              disabled={loading}
              className="w-full p-4 rounded-xl bg-[#111] border border-[#333] text-white font-semibold text-base disabled:opacity-60"
            >
              Back to Log In
            </button>
          </>
        )}

        {message && (
          <p className={`mt-5 rounded-xl border p-3 text-center text-sm font-bold ${getMessageClasses()}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}

export default Login
