import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
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
} from 'lucide-react'
import { useAuth } from '../pages/AuthContext'

function Navbar() {
  const location = useLocation()
  const { user, authReady } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

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
              <Link
                to={user ? '/dashboard' : '/search'}
                className="flex items-center gap-3"
              >
                <img
                  src="/vendly-logo.svg"
                  alt="Vendly"
                  className="h-10 w-10 object-contain"
                />
                <div>
                  <p className="text-lg font-black text-white">Vendly</p>
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
                const isActive = isSignup
                  ? false
                  : location.pathname === item.path

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

            {!user && (
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