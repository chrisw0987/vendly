import { Link, useLocation } from 'react-router-dom'
import {
  House,
  Package,
  Search,
  CalendarDays,
  Map,
  User,
} from 'lucide-react'

function Navbar() {
  const location = useLocation()

  const navItems = [
    {
      label: 'Home',
      path: '/dashboard',
      icon: House,
    },
    {
      label: 'Inventory',
      path: '/inventory',
      icon: Package,
    },
    {
      label: 'Search',
      path: '/search',
      icon: Search,
    },
    {
      label: 'Join Shows',
      path: '/shows',
      icon: CalendarDays,
    },
    {
      label: 'Map',
      path: '/map',
      icon: Map,
    },
    {
      label: 'Sales',
      path: '/sales',
      icon: User,
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#222] bg-black">
      <div className="mx-auto flex max-w-[430px] justify-between px-4 py-3">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path

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