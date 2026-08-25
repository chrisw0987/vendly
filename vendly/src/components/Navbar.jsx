import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  House,
  Package,
  Search,
  CalendarDays,
  Map,
  User,
  UserPlus,
  Menu,
  X,
  LogOut,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../pages/AuthContext'

function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, profileImageUrl, authReady } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!menuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [menuOpen])

  async function handleLogout() {
    if (loggingOut) return

    setLoggingOut(true)
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Logout failed:', error.message)
      setLoggingOut(false)
      return
    }

    setMenuOpen(false)
    navigate('/')
  }

  const memberNavItems = [
    { label: 'Home', path: '/dashboard', icon: House },
    { label: 'Inventory', path: '/inventory', icon: Package },
    { label: 'Search', path: '/search', icon: Search },
    { label: 'Join Shows', path: '/shows', icon: CalendarDays },
    { label: 'Map', path: '/map', icon: Map },
    { label: 'Activity', path: '/activity', icon: User },
  ]

  const guestNavItems = [
    { label: 'Search', path: '/search', icon: Search },
    { label: 'Explore Shows', path: '/map', icon: Map },
    { label: 'Sign Up', path: '/?mode=signup', icon: UserPlus },
  ]

  const navItems = user ? memberNavItems : guestNavItems

  if (!authReady) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className="fixed left-4 top-4 z-[80] flex h-11 w-11 items-center justify-center rounded-xl border border-[#2a2a2a] bg-black/95 text-white shadow-lg backdrop-blur"
        aria-label="Open navigation menu"
        aria-expanded={menuOpen}
      >
        <Menu size={22} />
      </button>

      {menuOpen && (
        <div className="fixed inset-0 z-[90]">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation menu"
          />

          <aside className="absolute left-0 top-0 flex h-full w-[290px] max-w-[82vw] flex-col border-r border-[#222] bg-[#0b0b0b] p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <Link to={user ? '/dashboard' : '/search'} className="flex min-w-0 items-center gap-3">
                {user && profileImageUrl ? (
                  <img
                    src={profileImageUrl}
                    alt="Profile"
                    className="h-11 w-11 shrink-0 rounded-full border border-[#333] object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#2a2a2a] bg-black">
                    <User size={20} className="text-gray-400" />
                  </div>
                )}

                <div className="min-w-0">
                  <p className="truncate text-lg font-black text-white">Vendly</p>
                  <p className="text-[11px] text-gray-500">
                    {user ? 'Member menu' : 'Guest menu'}
                  </p>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#2a2a2a] bg-black text-gray-300"
                aria-label="Close navigation menu"
              >
                <X size={19} />
              </button>
            </div>

            <nav className="mt-7 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon
                const isSignup = item.path === '/?mode=signup'
                const isActive = isSignup ? false : location.pathname === item.path

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-sm font-semibold transition ${
                      isActive
                        ? 'border-yellow-900/70 bg-yellow-950/20 text-yellow-300'
                        : 'border-transparent text-gray-300 hover:border-[#222] hover:bg-[#111] hover:text-white'
                    }`}
                  >
                    <Icon size={19} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>

            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl border border-red-900/70 bg-red-950/20 px-4 py-3 text-sm font-bold text-red-300 disabled:opacity-60"
              >
                <LogOut size={17} />
                {loggingOut ? 'Logging Out...' : 'Log Out'}
              </button>
            ) : (
              <div className="mt-auto rounded-2xl border border-yellow-900/50 bg-yellow-950/10 p-4">
                <p className="text-sm font-bold text-white">Browsing as Guest</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Search cards and explore shows without an account.
                </p>
                <Link
                  to="/?mode=signup"
                  className="mt-3 flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-black text-black"
                >
                  Create Account
                </Link>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  )
}

export default Navbar