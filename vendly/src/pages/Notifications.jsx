import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCheck, MapPin, Store, ChevronRight, CalendarDays, Mail } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'

function Notifications() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [userId, setUserId] = useState(null)
  const [showDigestEnabled, setShowDigestEnabled] = useState(false)
  const [loadingEmailPreference, setLoadingEmailPreference] = useState(true)
  const [savingEmailPreference, setSavingEmailPreference] = useState(false)

  useEffect(() => {
    fetchNotifications()
  }, [])

  async function fetchNotifications() {
    setLoading(true)
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      navigate('/')
      return
    }

    setUserId(user.id)

    const { data: emailPreference, error: emailPreferenceError } = await supabase
      .from('email_preferences')
      .select('show_digest_enabled')
      .eq('user_id', user.id)
      .maybeSingle()

    if (emailPreferenceError) {
      console.warn('Email preference load failed:', emailPreferenceError)
      setShowDigestEnabled(false)
    } else {
      setShowDigestEnabled(Boolean(emailPreference?.show_digest_enabled))
    }

    setLoadingEmailPreference(false)

    const { data, error } = await supabase
      .from('notifications')
      .select(`
        id,
        type,
        event_id,
        wishlist_item_id,
        inventory_item_id,
        vendor_id,
        is_read,
        created_at,
        events (
          id,
          name,
          starts_at,
          city,
          state
        ),
        inventory_items (
          id,
          card_name,
          set_name,
          card_number,
          image_url,
          listing_price,
          market_price,
          condition,
          item_type,
          grade_company,
          grade
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Notification load failed:', error)
      setMessage(error.message)
      setNotifications([])
      setLoading(false)
      return
    }

    const baseNotifications = data || []

    const vendorIds = [
      ...new Set(baseNotifications.map((item) => item.vendor_id).filter(Boolean)),
    ]

    const eventIds = [
      ...new Set(baseNotifications.map((item) => item.event_id).filter(Boolean)),
    ]

    let profileMap = new Map()

    if (vendorIds.length > 0 && eventIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('vendor_event_profiles')
        .select('vendor_id, event_id, display_name, booth_number, public_enabled')
        .in('vendor_id', vendorIds)
        .in('event_id', eventIds)
        .eq('public_enabled', true)

      if (profilesError) {
        console.warn('Notification vendor profile lookup failed:', profilesError)
      } else {
        profileMap = new Map(
          (profiles || []).map((profile) => [
            `${profile.vendor_id}:${profile.event_id}`,
            profile,
          ])
        )
      }
    }

    const hydratedNotifications = baseNotifications.map((notification) => ({
      ...notification,
      vendor_profile:
        profileMap.get(`${notification.vendor_id}:${notification.event_id}`) || null,
    }))

    setNotifications(hydratedNotifications)
    setLoading(false)
  }

  async function markRead(id) {
    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, is_read: true } : item
      )
    )

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
  }

  async function markAllRead() {
    const unreadIds = notifications
      .filter((item) => !item.is_read)
      .map((item) => item.id)

    if (unreadIds.length === 0) return

    setNotifications((current) =>
      current.map((item) => ({ ...item, is_read: true }))
    )

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds)

    if (error) {
      setMessage(error.message)
      fetchNotifications()
    }
  }


  async function markShowRead(eventId) {
    const unreadIds = notifications
      .filter((item) => item.event_id === eventId && !item.is_read)
      .map((item) => item.id)

    if (unreadIds.length === 0) return

    setNotifications((current) =>
      current.map((item) =>
        item.event_id === eventId ? { ...item, is_read: true } : item
      )
    )

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds)

    if (error) {
      setMessage(error.message)
      fetchNotifications()
    }
  }

  async function toggleShowDigest() {
    if (!userId || savingEmailPreference) return

    const nextValue = !showDigestEnabled
    setSavingEmailPreference(true)
    setShowDigestEnabled(nextValue)
    setMessage('')

    const { error } = await supabase
      .from('email_preferences')
      .upsert(
        {
          user_id: userId,
          show_digest_enabled: nextValue,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      )

    if (error) {
      setShowDigestEnabled(!nextValue)
      setMessage(error.message)
    }

    setSavingEmailPreference(false)
  }

  function formatPrice(item) {
    const value = Number(item?.listing_price ?? item?.market_price)
    return Number.isFinite(value) && value > 0
      ? `$${value.toFixed(2)}`
      : 'Price not listed'
  }

  function formatShowDate(value) {
    if (!value) return 'Upcoming show'
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  }

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  )


  const showGroups = useMemo(() => {
    const groups = new Map()

    notifications.forEach((notification) => {
      const eventKey = notification.event_id || 'unknown-event'

      if (!groups.has(eventKey)) {
        groups.set(eventKey, {
          eventId: notification.event_id,
          event: notification.events || null,
          notifications: [],
        })
      }

      groups.get(eventKey).notifications.push(notification)
    })

    return [...groups.values()].sort((a, b) => {
      const aDate = new Date(a.event?.starts_at || 0).getTime()
      const bDate = new Date(b.event?.starts_at || 0).getTime()

      if (aDate !== bDate) return aDate - bDate

      const aNewest = Math.max(
        ...a.notifications.map((item) => new Date(item.created_at || 0).getTime())
      )
      const bNewest = Math.max(
        ...b.notifications.map((item) => new Date(item.created_at || 0).getTime())
      )

      return bNewest - aNewest
    })
  }, [notifications])

  return (
    <div className="min-h-screen bg-black pb-24 text-white">
      <main className="mx-auto max-w-[430px] px-5 pt-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Bell size={24} className="text-yellow-300" />
              <h1 className="text-3xl font-black">Card Alerts</h1>
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Your show-by-show hunt list for wishlist cards vendors are bringing.
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="flex shrink-0 items-center gap-1 rounded-xl border border-[#2a2a2a] bg-[#111] px-3 py-2 text-xs font-bold text-gray-300"
            >
              <CheckCheck size={15} />
              Read all
            </button>
          )}
        </div>

        <section className="mb-5 rounded-2xl border border-[#222] bg-[#111] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black text-yellow-300">
                <Mail size={18} />
              </div>

              <div className="min-w-0">
                <p className="font-bold text-white">Email Show Digest</p>
                <p className="mt-1 text-xs leading-5 text-gray-400">
                  Get one email the day before a saved show when wishlist matches
                  are available.
                </p>
                <p className="mt-1 text-[11px] leading-4 text-gray-600">
                  In-app card alerts are separate and stay available in Vendly.
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={showDigestEnabled}
              aria-label="Email Show Digest"
              disabled={loadingEmailPreference || savingEmailPreference}
              onClick={toggleShowDigest}
              className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${
                showDigestEnabled ? 'bg-green-400' : 'bg-[#333]'
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                  showDigestEnabled ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>

          {!loadingEmailPreference && (
            <p
              className={`mt-3 text-xs font-semibold ${
                showDigestEnabled ? 'text-green-300' : 'text-gray-500'
              }`}
            >
              {showDigestEnabled
                ? 'Day-before email digests are on.'
                : 'Day-before email digests are off.'}
            </p>
          )}
        </section>

        {unreadCount > 0 && (
          <div className="mb-5 rounded-2xl border border-yellow-900/60 bg-yellow-950/20 p-4">
            <p className="font-bold text-yellow-300">
              {unreadCount} new {unreadCount === 1 ? 'match' : 'matches'}
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-400">
              These are live Vendly alerts. Email and show-day digests can be added next.
            </p>
          </div>
        )}

        {message && (
          <p className="mb-4 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Checking your wishlist matches...</p>
        ) : notifications.length === 0 ? (
          <div className="rounded-3xl border border-[#222] bg-[#111] p-7 text-center">
            <Bell className="mx-auto text-gray-600" size={36} />
            <h2 className="mt-4 text-xl font-bold">No card alerts yet</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Save a show and add cards to your wishlist. When a vendor brings a matching public card, it will appear here.
            </p>
            <button
              type="button"
              onClick={() => navigate('/search')}
              className="mt-5 rounded-xl bg-white px-5 py-3 text-sm font-black text-black"
            >
              Find Cards
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {showGroups.map((group) => {
              const groupUnreadCount = group.notifications.filter(
                (item) => !item.is_read
              ).length

              const vendorGroups = new Map()

              group.notifications.forEach((notification) => {
                const profile = notification.vendor_profile
                const vendorKey = `${notification.vendor_id || 'vendor'}:${
                  profile?.booth_number || 'no-booth'
                }`

                if (!vendorGroups.has(vendorKey)) {
                  vendorGroups.set(vendorKey, {
                    vendorId: notification.vendor_id,
                    displayName: profile?.display_name || 'Vendor',
                    boothNumber: profile?.booth_number || '',
                    notifications: [],
                  })
                }

                vendorGroups.get(vendorKey).notifications.push(notification)
              })

              const vendors = [...vendorGroups.values()].sort((a, b) => {
                if (a.boothNumber && b.boothNumber) {
                  return String(a.boothNumber).localeCompare(
                    String(b.boothNumber),
                    undefined,
                    { numeric: true }
                  )
                }

                return a.displayName.localeCompare(b.displayName)
              })

              return (
                <section
                  key={group.eventId || group.event?.id || 'unknown-event'}
                  className="overflow-hidden rounded-3xl border border-[#222] bg-[#111]"
                >
                  <div className="border-b border-[#222] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <CalendarDays
                            size={17}
                            className="shrink-0 text-yellow-300"
                          />
                          <p className="text-lg font-black text-white">
                            {group.event?.name || 'Saved Show'}
                          </p>

                          {groupUnreadCount > 0 && (
                            <span className="rounded-full bg-yellow-300 px-2 py-1 text-[10px] font-black text-black">
                              {groupUnreadCount} new
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-xs text-gray-500">
                          {formatShowDate(group.event?.starts_at)}
                          {group.event?.city || group.event?.state
                            ? ` · ${[group.event?.city, group.event?.state]
                                .filter(Boolean)
                                .join(', ')}`
                            : ''}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-2xl font-black text-yellow-300">
                          {group.notifications.length}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-gray-600">
                          {group.notifications.length === 1 ? 'match' : 'matches'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        markShowRead(group.eventId)
                        navigate(
                          group.eventId
                            ? `/map?event=${group.eventId}&view=hunt`
                            : '/map'
                        )
                      }}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white p-3 text-sm font-black text-black"
                    >
                      Open Show Hunt
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="space-y-4 p-4">
                    {vendors.map((vendor) => (
                      <div
                        key={`${vendor.vendorId}:${vendor.boothNumber}`}
                        className="rounded-2xl border border-[#222] bg-black p-3"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 font-bold text-white">
                              <Store size={15} className="text-green-300" />
                              <span className="truncate">
                                {vendor.displayName}
                              </span>
                            </p>

                            <p className="mt-1 text-xs font-semibold text-green-300">
                              {vendor.boothNumber
                                ? `Booth ${vendor.boothNumber}`
                                : 'Booth TBD'}
                            </p>
                          </div>

                          <span className="rounded-full bg-[#171717] px-2.5 py-1 text-[10px] font-bold text-gray-400">
                            {vendor.notifications.length}{' '}
                            {vendor.notifications.length === 1 ? 'card' : 'cards'}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {vendor.notifications.map((notification) => {
                            const item = notification.inventory_items

                            return (
                              <button
                                key={notification.id}
                                type="button"
                                onClick={() => {
                                  markRead(notification.id)
                                  navigate(
                                    notification.event_id
                                      ? `/map?event=${notification.event_id}&view=hunt`
                                      : '/map'
                                  )
                                }}
                                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                                  notification.is_read
                                    ? 'border-[#222] bg-[#0d0d0d]'
                                    : 'border-yellow-900/60 bg-yellow-950/10'
                                }`}
                              >
                                <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md border border-[#222] bg-[#151515]">
                                  {item?.image_url ? (
                                    <img
                                      src={item.image_url}
                                      alt={item.card_name || 'Card'}
                                      className="h-full w-full object-contain"
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-[8px] text-gray-600">
                                      Card
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-white">
                                        {item?.card_name || 'Wishlist match'}
                                      </p>
                                      <p className="mt-1 truncate text-[11px] text-gray-600">
                                        {item?.set_name || 'Unknown set'}
                                        {item?.card_number
                                          ? ` #${item.card_number}`
                                          : ''}
                                      </p>
                                    </div>

                                    {!notification.is_read && (
                                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-yellow-300" />
                                    )}
                                  </div>

                                  <p className="mt-1 text-sm font-black text-yellow-300">
                                    {formatPrice(item)}
                                  </p>
                                </div>

                                <ChevronRight
                                  size={15}
                                  className="shrink-0 text-gray-600"
                                />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </main>

      <Navbar />
    </div>
  )
}

export default Notifications
