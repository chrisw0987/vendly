import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Search from './pages/Search'
import Inventory from './pages/Inventory'
import Map from './pages/Map'
import Shows from './pages/Shows'
import Sales from './pages/Sales'
import Admin from './pages/Admin'
import './index.css'


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/search" element={<Search />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/map" element={<Map />} />
        <Route path="/shows" element={<Shows />} />
        <Route path="/sales" element={<Sales/>} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App