import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Search from './pages/Search'
import Inventory from './pages/Inventory'
import Map from './pages/Map'
import Shows from './pages/Shows'
import Sales from './pages/Sales'
import Admin from './pages/Admin'
import ImportInventory from './pages/ImportInventory'
import { supabase } from './lib/supabase'
import './index.css'

function ProtectedRoute({ children }) {
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [user, setUser] = useState(null)

  useEffect(() => {
    let mounted = true

    async function checkUser() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (!mounted) return

      setUser(currentUser || null)
      setCheckingAuth(false)
    }

    checkUser()

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

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm text-gray-400">Loading Vendly...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Guest-accessible */}
        <Route path="/search" element={<Search />} />
        <Route path="/map" element={<Map />} />

        {/* Account required */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute>
              <Inventory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/import-inventory"
          element={
            <ProtectedRoute>
              <ImportInventory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shows"
          element={
            <ProtectedRoute>
              <Shows />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales"
          element={
            <ProtectedRoute>
              <Sales />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App