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
  const [profileImageUrl, setProfileImageUrl] = useState('')
  const [authReady, setAuthReady] = useState(false)

  const loadProfile = useCallback(async (nextUser) => {
    if (!nextUser) {
      setAccountType('user')
      setProfileImageUrl('')
      return { accountType: 'user', profileImageUrl: '' }
    }

    const { data, error } = await supabase
      .from('users')
      .select('account_type, profile_image_url')
      .eq('id', nextUser.id)
      .maybeSingle()

    if (error) {
      console.warn('Unable to load auth profile:', error.message)
      setAccountType('user')
      setProfileImageUrl('')
      return { accountType: 'user', profileImageUrl: '' }
    }

    const nextAccountType = data?.account_type || 'user'
    const nextProfileImageUrl = data?.profile_image_url || ''

    setAccountType(nextAccountType)
    setProfileImageUrl(nextProfileImageUrl)

    return {
      accountType: nextAccountType,
      profileImageUrl: nextProfileImageUrl,
    }
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
        if (mounted) setAuthReady(true)
      }
    }

    initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return

      const nextUser = session?.user || null
      setUser(nextUser)

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
      profileImageUrl,
      authReady,
      isGuest: authReady && !user,
      isVendor: accountType === 'vendor' || accountType === 'admin',
      isAdmin: accountType === 'admin',
      refreshProfile,
    }),
    [user, accountType, profileImageUrl, authReady, refreshProfile]
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