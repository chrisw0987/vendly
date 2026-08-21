import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import BuyingTab from '../components/activity/BuyingTab'
import SellingTab from '../components/activity/SellingTab'
import { supabase } from '../lib/supabase'

function Activity() {
  const [activeTab, setActiveTab] = useState('buying')
  const [userId, setUserId] = useState(null)
  const [accountType, setAccountType] = useState('user')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAccount()
  }, [])

  async function loadAccount() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      return
    }

    setUserId(user.id)

    const { data } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .maybeSingle()

    setAccountType(data?.account_type || 'user')
    setLoading(false)
  }

  const isVendor = accountType === 'vendor' || accountType === 'admin'

  return (
    <div className="min-h-screen bg-black pb-24 text-white">
      <main className="mx-auto max-w-[430px] px-5 pt-8">
        <div className="mb-5">
          <h1 className="text-3xl font-bold">Activity</h1>
          <p className="mt-1 text-sm text-gray-400">
            Keep track of the cards you buy and sell.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-2xl border border-[#2a2a2a] bg-[#111] p-1">
          <button
            type="button"
            onClick={() => setActiveTab('buying')}
            className={`rounded-xl px-4 py-3 text-sm font-black transition ${
              activeTab === 'buying'
                ? 'bg-white text-black'
                : 'text-gray-400'
            }`}
          >
            Buying
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('selling')}
            className={`rounded-xl px-4 py-3 text-sm font-black transition ${
              activeTab === 'selling'
                ? 'bg-white text-black'
                : 'text-gray-400'
            }`}
          >
            Selling
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading activity...</p>
        ) : activeTab === 'buying' ? (
          <BuyingTab userId={userId} />
        ) : (
          <SellingTab userId={userId} isVendor={isVendor} />
        )}
      </main>

      <Navbar />
    </div>
  )
}

export default Activity