import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import WishlistTab from '../components/inventory/WishlistTab'
import VendorInventoryTab from '../components/inventory/VendorInventoryTab'
import { supabase } from '../lib/supabase'

function Inventory() {
  const [accountType, setAccountType] = useState('user')
  const [activeTab, setActiveTab] = useState('wishlist')
  const [loadingAccount, setLoadingAccount] = useState(true)
  const [message, setMessage] = useState('')

  const isVendor = accountType === 'vendor' || accountType === 'admin'

  useEffect(() => {
    loadAccountType()
  }, [])

  async function loadAccountType() {
    setLoadingAccount(true)
    setMessage('')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setMessage(userError?.message || 'You must be logged in.')
      setLoadingAccount(false)
      return
    }

    const { data, error } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      setMessage(error.message)
      setLoadingAccount(false)
      return
    }

    setAccountType(data?.account_type || 'user')
    setLoadingAccount(false)
  }

  return (
    <div className="min-h-screen bg-black pb-24 text-white">
      <main className="mx-auto max-w-[430px] px-5 pt-8">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold">Inventory</h1>
          <p className="mt-1 text-sm text-gray-400">
            Manage cards you want and cards you sell.
          </p>
        </div>

        {isVendor && !loadingAccount && (
          <div className="mb-6 grid grid-cols-2 rounded-2xl border border-[#222] bg-[#111] p-1">
            <button
              onClick={() => setActiveTab('wishlist')}
              className={`rounded-xl px-4 py-3 text-sm font-bold transition ${
                activeTab === 'wishlist'
                  ? 'bg-white text-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Wishlist
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`rounded-xl px-4 py-3 text-sm font-bold transition ${
                activeTab === 'inventory'
                  ? 'bg-white text-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Vendor Inventory
            </button>
          </div>
        )}

        {message && (
          <p className="mb-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm font-bold text-red-300">
            {message}
          </p>
        )}

        {loadingAccount ? (
          <p className="text-sm text-gray-400">Loading card manager...</p>
        ) : activeTab === 'inventory' && isVendor ? (
          <VendorInventoryTab />
        ) : (
          <WishlistTab />
        )}
      </main>

      <Navbar />
    </div>
  )
}

export default Inventory
