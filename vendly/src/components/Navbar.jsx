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
} from 'lucide-react'
import { supabase } from '../lib/supabase'

function Navbar() {
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadUser() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (!mounted) return
      setUser(currentUser || null)
      setCheckingAuth(false)
    }

    loadUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUser(session?.user || null)
      setCheckingAuth(false)
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

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
    { label: 'Explore', path: '/map', icon: Map },
    { label: 'Sign Up', path: '/?mode=signup', icon: UserPlus },
  ]

  const navItems = user ? memberNavItems : guestNavItems

  if (checkingAuth) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#222] bg-black">
      <div
        className={`mx-auto flex max-w-[430px] px-4 py-3 ${
          user ? 'justify-between' : 'justify-around'
        }`}
      >
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            item.path === '/?mode=signup'
              ? false
              : location.pathname === item.path

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center text-[11px] ${
                isActive ? 'text-white' : 'text-gray-400'
              }`}
            >
              <Icon size={20} />
              <span className="mt-1">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default Navbar