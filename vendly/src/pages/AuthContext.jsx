//Logged-in page → navigate → component renders → auth/session check finishes → logged-in UI appears
//During that tiny gap, some pages may initially assume user === null and render their guest version. That's why you catch a glimpse of things like the guest Search layout even though you're authenticated.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [accountType, setAccountType] = useState('user')
  const [authReady, setAuthReady] = useState(false)

  const loadProfile = useCallback(async (nextUser) => {
    if (!nextUser) {
      setAccountType('user')
      return 'user'
    }

    const { data, error } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', nextUser.id)
      .maybeSingle()

    if (error) {
      console.warn('Unable to load auth profile:', error.message)
      setAccountType('user')
      return 'user'
    }

    const nextAccountType = data?.account_type || 'user'
    setAccountType(nextAccountType)

    return nextAccountType
  }, [])

  const refreshProfile = useCallback(async () => {
    return loadProfile(user)
  }, [loadProfile, user])

  useEffect(() => {
    let mounted = true

    async function initializeAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!mounted) return

        const nextUser = session?.user || null

        setUser(nextUser)
        await loadProfile(nextUser)
      } catch (error) {
        console.error('Auth initialization failed:', error)
      } finally {
        if (mounted) {
          setAuthReady(true)
        }
      }
    }

    initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return

      const nextUser = session?.user || null

      // Update the session immediately.
      setUser(nextUser)

      // Keep the app rendered once initial auth is ready.
      // Profile changes refresh in the background instead of
      // forcing every page back into a loading state.
      loadProfile(nextUser).catch((error) => {
        console.error('Auth profile refresh failed:', error)
      })
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [loadProfile])

  const value = useMemo(
    () => ({
      user,
      accountType,
      authReady,
      isGuest: authReady && !user,
      isVendor: accountType === 'vendor' || accountType === 'admin',
      isAdmin: accountType === 'admin',
      refreshProfile,
    }),
    [user, accountType, authReady, refreshProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.')
  }

  return context
}