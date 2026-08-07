import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

import {
  Package,
  Search,
  Map,
  Store,
  ReceiptText,
  CalendarDays,
  DollarSign,
  Eye,
  LogOut,
  Plus,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  MapPin,
  Ticket,
} from 'lucide-react'

function Dashboard() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [username, setUsername] = useState('')
  const [accountType, setAccountType] = useState('user')
  const [stats, setStats] = useState({
    availableCount: 0,
    publicCount: 0,
    soldOutCount: 0,
    assignedCount: 0,
    listedValue: 0,
    costBasis: 0,
  })
  const [upcomingShows, setUpcomingShows] = useState([])
  const [savedUpcomingShows, setSavedUpcomingShows] = useState([])
  const [recentSales, setRecentSales] = useState([])
  const [wishlistMatches, setWishlistMatches] = useState([])
  const [showDayEvents, setShowDayEvents] = useState([])

  const isVendor = accountType === 'vendor' || accountType === 'admin'
  const isAdmin = accountType === 'admin'

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function getUserOrRedirect() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      navigate('/')
      return null
    }

    return user
  }

  async function fetchDashboardData() {
    setLoading(true)
    setMessage('')

    const user = await getUserOrRedirect()
    if (!user) return

    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .select('username, account_type')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      setMessage(profileError.message)
      setLoading(false)
      return
    }

    const nextAccountType = profileData?.account_type || 'user'
    const userIsVendor = nextAccountType === 'vendor' || nextAccountType === 'admin'

    setUsername(profileData?.username || '')
    setAccountType(nextAccountType)

    const { data: wishlistSummaryData, error: wishlistSummaryError } =
      await supabase.rpc('get_user_wishlist_summary')

    if (wishlistSummaryError) {
      console.error('Dashboard wishlist summary failed:', wishlistSummaryError)
      setWishlistMatches([])
    } else {
      const matchedWishlistItems = (wishlistSummaryData || [])
        .filter((item) => Number(item.total_matches || 0) > 0)
        .sort((a, b) => {
          const savedShowDifference =
            Number(b.saved_show_matches || 0) -
            Number(a.saved_show_matches || 0)

          if (savedShowDifference !== 0) return savedShowDifference

          const aPrice =
            a.lowest_price === null || a.lowest_price === undefined
              ? Number.POSITIVE_INFINITY
              : Number(a.lowest_price)

          const bPrice =
            b.lowest_price === null || b.lowest_price === undefined
              ? Number.POSITIVE_INFINITY
              : Number(b.lowest_price)

          return aPrice - bPrice
        })

      setWishlistMatches(matchedWishlistItems)
    }

    const { data: showDayData, error: showDayError } = await supabase.rpc(
      'get_show_day_summary'
    )

    if (showDayError) {
      console.error('Show-day summary failed:', showDayError)
      setShowDayEvents([])
    } else {
      setShowDayEvents(showDayData || [])
    }

    const { data: inventoryData, error: inventoryError } = await supabase
      .from('inventory_items')
      .select('id, quantity, is_public, is_sold, listing_price, purchase_price')
      .eq('owner_id', user.id)

    if (inventoryError) {
      setMessage(inventoryError.message)
      setLoading(false)
      return
    }

    let assignmentsData = []
    let showsData = []
    let salesData = []
    let savedShowsData = []

    if (userIsVendor) {
      const { data: nextAssignmentsData, error: assignmentsError } = await supabase
        .from('show_inventory')
        .select('inventory_item_id')
        .eq('vendor_id', user.id)

      if (assignmentsError) {
        setMessage(assignmentsError.message)
        setLoading(false)
        return
      }

      assignmentsData = nextAssignmentsData || []

      const { data: nextShowsData, error: showsError } = await supabase
        .from('vendor_event_profiles')
        .select(`
          id,
          booth_number,
          display_name,
          public_enabled,
          events (
            id,
            name,
            city,
            state,
            venue,
            starts_at,
            icon_url
          )
        `)
        .eq('vendor_id', user.id)

      if (showsError) {
        setMessage(showsError.message)
        setLoading(false)
        return
      }

      showsData = nextShowsData || []

      const { data: nextSalesData, error: salesError } = await supabase
        .from('inventory_sales')
        .select(`
          id,
          sale_type,
          sale_quantity,
          total_sale_value,
          profit,
          sold_at,
          inventory_items (
            card_name,
            set_name,
            card_number,
            image_url
          )
        `)
        .eq('vendor_id', user.id)
        .order('sold_at', { ascending: false })
        .limit(3)

      if (salesError) {
        setMessage(salesError.message)
        setLoading(false)
        return
      }

      salesData = nextSalesData || []
    } else {
      const { data: nextSavedShowsData, error: savedShowsError } = await supabase
        .from('saved_events')
        .select(`
          id,
          events (
            id,
            name,
            city,
            state,
            venue,
            starts_at,
            icon_url
          )
        `)
        .eq('user_id', user.id)

      if (savedShowsError) {
        setMessage(savedShowsError.message)
        setLoading(false)
        return
      }

      savedShowsData = nextSavedShowsData || []
    }

    const inventory = inventoryData || []
    const assignments = assignmentsData || []
    const assignedItemIds = new Set(assignments.map((row) => row.inventory_item_id))

    const nextStats = inventory.reduce(
      (acc, item) => {
        const quantity = Number(item.quantity || 0)
        const listingPrice = Number(item.listing_price || 0)
        const purchasePrice = Number(item.purchase_price || 0)

        if (item.is_sold) {
          acc.soldOutCount += 1
        } else {
          acc.availableCount += 1
          acc.listedValue += listingPrice * quantity
          acc.costBasis += purchasePrice * quantity
        }

        if (item.is_public && !item.is_sold) acc.publicCount += 1
        if (assignedItemIds.has(item.id)) acc.assignedCount += 1

        return acc
      },
      {
        availableCount: 0,
        publicCount: 0,
        soldOutCount: 0,
        assignedCount: 0,
        listedValue: 0,
        costBasis: 0,
      }
    )

    const sortedVendorShows =
      showsData
        ?.map((profile) => ({
          ...profile,
          event: profile.events,
        }))
        .filter((profile) => profile.event)
        .sort(
          (a, b) =>
            new Date(a.event.starts_at || 0).getTime() -
            new Date(b.event.starts_at || 0).getTime()
        )
        .slice(0, 3) || []

    const sortedSavedShows =
      savedShowsData
        ?.map((row) => row.events)
        .filter(Boolean)
        .sort(
          (a, b) =>
            new Date(a.starts_at || 0).getTime() -
            new Date(b.starts_at || 0).getTime()
        )
        .slice(0, 3) || []

    setStats(nextStats)
    setUpcomingShows(sortedVendorShows)
    setSavedUpcomingShows(sortedSavedShows)
    setRecentSales(salesData || [])
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  function formatMoney(value) {
    return `$${Number(value || 0).toFixed(2)}`
  }

  function formatDate(date) {
    if (!date) return 'TBD'

    return new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function formatTime(date) {
    if (!date) return ''

    return new Date(date).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const potentialProfit = stats.listedValue - stats.costBasis
  const totalWishlistListings = wishlistMatches.reduce(
    (total, item) => total + Number(item.total_matches || 0),
    0
  )
  const visibleWishlistMatches = wishlistMatches.slice(0, 3)
  const activeShowDayEvent = showDayEvents[0] || null

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <main className="mx-auto max-w-[430px] px-5 pt-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src="/vendly-logo.svg"
              alt="Vendly Logo"
              className="h-16 w-16 shrink-0"
            />
        
            <div>
              <h1 className="text-3xl font-bold">
                Welcome back{username ? `, ${username}` : ''}
              </h1>

              <p className="mt-1 text-sm text-gray-400">
                Your One Stop For TCG Shows
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-xl border border-[#222] bg-[#111] p-3 text-gray-300 hover:text-white"
            aria-label="Log out"
          >
            <LogOut size={18} />
          </button>
        </div>

        {message && (
          <p className="mb-4 rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-gray-300">
            {message}
          </p>
        )}

        {!loading && activeShowDayEvent && (
          <section className="mb-6 overflow-hidden rounded-3xl border border-yellow-700/50 bg-gradient-to-br from-yellow-300 to-amber-500 p-5 text-black shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <Ticket size={20} />
                  <p className="text-sm font-black uppercase tracking-wide">
                    Today&apos;s Show
                  </p>
                </div>

                <h2 className="break-words text-2xl font-black leading-tight">
                  {activeShowDayEvent.event_name} 
                </h2>

                <p className="mt-2 text-sm font-semibold text-black/70">
                  {[activeShowDayEvent.venue, activeShowDayEvent.city, activeShowDayEvent.state]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>

              {activeShowDayEvent.icon_url ? (
                <img
                  src={activeShowDayEvent.icon_url}
                  alt={activeShowDayEvent.event_name}
                  className="h-14 w-14 shrink-0 rounded-2xl border border-black/10 bg-white object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-black/10">
                  <CalendarDays size={24} />
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-black/10 p-3">
                <p className="text-xs font-bold text-black/60">Wishlist matches</p>
                <p className="mt-1 text-xl font-black">
                  {Number(activeShowDayEvent.matched_wishlist_item_count || 0)}
                </p>
              </div>

              <div className="rounded-2xl bg-black/10 p-3">
                <p className="text-xs font-bold text-black/60">Vendors</p>
                <p className="mt-1 text-xl font-black">
                  {Number(activeShowDayEvent.participating_vendor_count || 0)}
                </p>
              </div>
            </div>

            <p className="mt-3 text-sm font-semibold text-black/75">
              {Number(activeShowDayEvent.matching_listing_count || 0)} matching vendor listing
              {Number(activeShowDayEvent.matching_listing_count || 0) === 1 ? '' : 's'}
              {activeShowDayEvent.is_vendor_show && activeShowDayEvent.booth_number
                ? ` · Your booth: ${activeShowDayEvent.booth_number}`
                : ''}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                to={`/map?event=${activeShowDayEvent.event_id}&view=search`}
                className="flex items-center justify-center gap-2 rounded-xl bg-black p-3 text-sm font-bold text-white"
              >
                <Search size={16} />
                Search This Show
              </Link>

              <Link
                to={`/map?event=${activeShowDayEvent.event_id}&view=floorplan`}
                className="flex items-center justify-center gap-2 rounded-xl border border-black/20 bg-white/80 p-3 text-sm font-bold text-black"
              >
                <Map size={16} />
                View Floorplan
              </Link>
            </div>
          </section>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading dashboard...</p>
        ) : (
          <>
            <section className="mb-6 grid grid-cols-2 gap-3">
              <DashboardAction
                to="/search"
                icon={<Plus size={20} />}
                title={isVendor ? 'Add Inventory' : 'Add Cards'}
                subtitle={isVendor ? 'Search and list cards' : 'Search and track cards'}
              />
              <DashboardAction
                to="/inventory"
                icon={<Package size={20} />}
                title={isVendor ? 'Inventory' : 'My Collection'}
                subtitle={isVendor ? 'Manage your cards' : 'View your cards'}
              />
              <DashboardAction
                to="/shows"
                icon={<Store size={20} />}
                title="Shows"
                subtitle={isVendor ? 'Manage booths' : 'Apply to vend'}
              />
              <DashboardAction
                to="/map"
                icon={<Map size={20} />}
                title="Map"
                subtitle="Explore shows"
              />
              {isAdmin && (
                <DashboardAction
                  to="/admin"
                  icon={<ShieldCheck size={20} />}
                  title="Admin"
                  subtitle="Manage Vendly"
                />
              )}
            </section>

            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles size={20} className="text-green-300" />
                    <h2 className="text-xl font-semibold">Wishlist Matches</h2>
                  </div>

                  {wishlistMatches.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      {wishlistMatches.length} wanted card
                      {wishlistMatches.length === 1 ? '' : 's'} ·{' '}
                      {totalWishlistListings} vendor listing
                      {totalWishlistListings === 1 ? '' : 's'}
                    </p>
                  )}
                </div>

                <Link
                  to="/inventory"
                  className="text-xs font-semibold text-yellow-300"
                >
                  View wishlist
                </Link>
              </div>

              {visibleWishlistMatches.length === 0 ? (
                <EmptyCard
                  title="No wishlist matches yet"
                  message="Add cards to your wishlist and Vendly will show matching vendor inventory from upcoming shows."
                  to="/search"
                  action="Add Wishlist Cards"
                />
              ) : (
                <div className="space-y-3">
                  {visibleWishlistMatches.map((match) => (
                    <Link
                      key={match.wishlist_item_id}
                      to="/inventory"
                      className="block rounded-2xl border border-green-900/70 bg-green-950/20 p-4 transition hover:bg-green-950/35"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-bold text-white">
                            {match.card_name}
                          </p>

                          <p className="mt-1 text-sm font-semibold text-green-300">
                            {Number(match.total_matches || 0)}{' '}
                            {Number(match.total_matches || 0) === 1
                              ? 'match'
                              : 'matches'}{' '}
                            available
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-xs text-gray-500">Lowest</p>
                          <p className="font-bold text-yellow-300">
                            {match.lowest_price === null ||
                            match.lowest_price === undefined
                              ? 'Not listed'
                              : formatMoney(match.lowest_price)}
                          </p>
                        </div>
                      </div>

                      {match.best_event_name && (
                        <div className="mt-3 flex items-start gap-2 border-t border-green-900/50 pt-3 text-xs text-gray-300">
                          <MapPin
                            size={14}
                            className="mt-0.5 shrink-0 text-green-300"
                          />
                          <p>
                            {match.best_event_name}
                            {match.best_booth_number
                              ? ` · Booth ${match.best_booth_number}`
                              : ''}
                            {match.best_is_saved_show ? ' · Saved show' : ''}
                          </p>
                        </div>
                      )}
                    </Link>
                  ))}

                  {wishlistMatches.length > visibleWishlistMatches.length && (
                    <Link
                      to="/inventory"
                      className="flex items-center justify-center gap-2 rounded-xl border border-[#222] bg-[#111] p-3 text-sm font-semibold text-gray-300"
                    >
                      View {wishlistMatches.length - visibleWishlistMatches.length}{' '}
                      more matched card
                      {wishlistMatches.length - visibleWishlistMatches.length === 1
                        ? ''
                        : 's'}
                      <ArrowRight size={15} />
                    </Link>
                  )}
                </div>
              )}
            </section>

            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {isVendor ? 'Inventory Snapshot' : 'Collection Snapshot'}
                </h2>
                <Link to="/inventory" className="text-xs font-semibold text-yellow-300">
                  View all
                </Link>
              </div>

              {isVendor ? (
                <div className="grid grid-cols-2 gap-3">
                  <StatCard
                    icon={<Package size={18} />}
                    label="Available"
                    value={stats.availableCount}
                  />
                  <StatCard
                    icon={<Eye size={18} />}
                    label="Public Listings"
                    value={stats.publicCount}
                  />
                  <StatCard
                    icon={<CalendarDays size={18} />}
                    label="Assigned to Shows"
                    value={stats.assignedCount}
                  />
                  <StatCard
                    icon={<ReceiptText size={18} />}
                    label="Sold Out"
                    value={stats.soldOutCount}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  <StatCard
                    icon={<Package size={18} />}
                    label="Cards Tracked"
                    value={stats.availableCount}
                  />
                </div>
              )}
            </section>

            {isVendor && (
              <section className="mb-6 rounded-3xl border border-[#222] bg-[#111] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <DollarSign className="text-yellow-300" size={20} />
                  <h2 className="text-xl font-semibold">Current Inventory Value</h2>
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-2xl bg-black p-3">
                    <p className="text-xs text-gray-500">Listed</p>
                    <p className="mt-1 font-bold text-yellow-300">
                      {formatMoney(stats.listedValue)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-black p-3">
                    <p className="text-xs text-gray-500">Cost</p>
                    <p className="mt-1 font-bold text-gray-300">
                      {formatMoney(stats.costBasis)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-black p-3">
                    <p className="text-xs text-gray-500">Potential</p>
                    <p
                      className={`mt-1 font-bold ${
                        potentialProfit >= 0 ? 'text-green-300' : 'text-red-300'
                      }`}
                    >
                      {formatMoney(potentialProfit)}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {isVendor && (
              <section className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Upcoming Vending Shows</h2>
                  <Link to="/shows" className="text-xs font-semibold text-yellow-300">
                    Manage
                  </Link>
                </div>

                {upcomingShows.length === 0 ? (
                  <EmptyCard
                    title="No vending shows yet"
                    message="Join a show from the Shows page to start assigning inventory."
                    to="/shows"
                    action="Go to Shows"
                  />
                ) : (
                  <div className="space-y-3">
                    {upcomingShows.map((profile) => (
                      <ShowCard
                        key={profile.id}
                        name={profile.event.name}
                        venue={profile.event.venue}
                        city={profile.event.city}
                        state={profile.event.state}
                        startsAt={profile.event.starts_at}
                        formatDate={formatDate}
                        formatTime={formatTime}
                        footerLabel="Booth"
                        footerValue={profile.booth_number || 'TBD'}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {isVendor ? (
              <section className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Recent Sales</h2>
                  <Link to="/sales" className="text-xs font-semibold text-yellow-300">
                    View sales
                  </Link>
                </div>

                {recentSales.length === 0 ? (
                  <EmptyCard
                    title="No sales yet"
                    message="Recorded sales will appear here after you sell inventory."
                    to="/inventory"
                    action="Open Inventory"
                  />
                ) : (
                  <div className="space-y-3">
                    {recentSales.map((sale) => {
                      const item = sale.inventory_items

                      return (
                        <div
                          key={sale.id}
                          className="rounded-2xl border border-[#222] bg-[#111] p-4"
                        >
                          <div className="flex gap-3">
                            {item?.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.card_name}
                                className="h-20 w-14 shrink-0 rounded-lg bg-black object-contain"
                              />
                            ) : (
                              <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-black">
                                <Package size={18} className="text-gray-600" />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="font-semibold">
                                {item?.card_name || 'Deleted item'}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                Qty {sale.sale_quantity || 1} · {formatDate(sale.sold_at)}
                              </p>

                              <div className="mt-2 flex gap-2 text-xs font-semibold">
                                <span className="rounded-full bg-yellow-950/30 px-2.5 py-1 text-yellow-300">
                                  {formatMoney(sale.total_sale_value)}
                                </span>
                                <span
                                  className={`rounded-full px-2.5 py-1 ${
                                    Number(sale.profit || 0) >= 0
                                      ? 'bg-green-950/40 text-green-300'
                                      : 'bg-red-950/40 text-red-300'
                                  }`}
                                >
                                  Profit {formatMoney(sale.profit)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            ) : (
              <section className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Upcoming Saved Shows</h2>
                  <Link to="/map" className="text-xs font-semibold text-yellow-300">
                    View map
                  </Link>
                </div>

                {savedUpcomingShows.length === 0 ? (
                  <EmptyCard
                    title="No saved shows yet"
                    message="Save shows from the Map page and they will appear here."
                    to="/map"
                    action="Explore Shows"
                  />
                ) : (
                  <div className="space-y-3">
                    {savedUpcomingShows.map((event) => (
                      <ShowCard
                        key={event.id}
                        name={event.name}
                        venue={event.venue}
                        city={event.city}
                        state={event.state}
                        startsAt={event.starts_at}
                        formatDate={formatDate}
                        formatTime={formatTime}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            <Link
              to="/search"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white p-4 font-semibold text-black"
            >
              <Search size={18} />
              {isVendor ? 'Search Cards' : 'Add Cards to Collection'}
            </Link>

          </>
        )}
      </main>

      <Navbar />
    </div>
  )
}

function DashboardAction({ to, icon, title, subtitle }) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-[#222] bg-[#111] p-4 transition hover:border-[#444]"
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-black text-yellow-300">
        {icon}
      </div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
    </Link>
  )
}

function StatCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-[#222] bg-[#111] p-4">
      <div className="mb-2 text-gray-500">{icon}</div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}

function ShowCard({
  name,
  venue,
  city,
  state,
  startsAt,
  formatDate,
  formatTime,
  footerLabel,
  footerValue,
}) {
  return (
    <div className="rounded-2xl border border-[#222] bg-[#111] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{name}</p>
          <p className="mt-1 text-sm text-gray-400">{venue || 'Venue TBD'}</p>
          <p className="text-sm text-gray-500">
            {[city, state].filter(Boolean).join(', ')}
          </p>
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold text-yellow-300">
            {formatDate(startsAt)}
          </p>
          <p className="text-xs text-gray-500">{formatTime(startsAt)}</p>
        </div>
      </div>

      {footerLabel && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-black px-3 py-2 text-sm">
          <span className="text-gray-400">{footerLabel}</span>
          <span className="font-semibold">{footerValue}</span>
        </div>
      )}
    </div>
  )
}

function EmptyCard({ title, message, to, action }) {
  return (
    <div className="rounded-2xl border border-[#222] bg-[#111] p-5 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-gray-400">{message}</p>
      {to && action && (
        <Link
          to={to}
          className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-[#222] bg-black p-3 text-sm font-semibold"
        >
          {action}
          <ArrowRight size={15} />
        </Link>
      )}
    </div>
  )
}

export default Dashboard