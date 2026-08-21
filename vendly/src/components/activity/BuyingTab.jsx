import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleOff,
  ShoppingBag,
} from 'lucide-react'

function BuyingTab({ userId }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [statuses, setStatuses] = useState({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [expandedEventId, setExpandedEventId] = useState(null)

  useEffect(() => {
    fetchPastHunts()
  }, [userId])

  function eventHasEnded(event) {
    if (!event) return false

    if (event.end_date) {
      const raw = String(event.end_date)
      const end =
        raw.length <= 10
          ? new Date(`${raw}T23:59:59`)
          : new Date(raw)

      return !Number.isNaN(end.getTime()) && end.getTime() < Date.now()
    }

    if (!event.starts_at) return false
    return new Date(event.starts_at).getTime() < Date.now()
  }

  async function fetchPastHunts() {
    if (!userId) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage('')

    const { error: finalizeError } = await supabase.rpc(
      'finalize_completed_show_hunts'
    )

    if (finalizeError) {
      console.warn('Past hunt finalization failed:', finalizeError)
    }

    const { data, error } = await supabase
      .from('show_hunt_entries')
      .select(`
        id,
        event_id,
        wishlist_item_id,
        inventory_item_id,
        vendor_id,
        card_name,
        set_name,
        card_number,
        image_url,
        listing_price,
        status,
        vendor_name,
        booth_number,
        finalized_at,
        events (
          id,
          name,
          city,
          state,
          starts_at,
          end_date
        )
      `)
      .eq('user_id', userId)
      .not('finalized_at', 'is', null)
      .order('finalized_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      setRows([])
    } else {
      setRows(data || [])
    }

    setStatuses({})
    setLoading(false)
  }

  function formatDate(date) {
    if (!date) return 'Date unavailable'

    return new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function formatPrice(item) {
    const price = Number(item?.listing_price ?? item?.market_price)
    return Number.isFinite(price) ? `$${price.toFixed(2)}` : 'Price unavailable'
  }

  const hunts = useMemo(() => {
    const groups = new Map()

    rows.forEach((row) => {
      if (!row.event_id) return

      if (!groups.has(row.event_id)) {
        groups.set(row.event_id, {
          eventId: row.event_id,
          event: row.events,
          cards: [],
        })
      }

      groups.get(row.event_id).cards.push({
        ...row,
        inventory_items: {
          card_name: row.card_name,
          set_name: row.set_name,
          card_number: row.card_number,
          image_url: row.image_url,
          listing_price: row.listing_price,
        },
        huntStatus: row.status || 'missed',
      })
    })

    return [...groups.values()]
      .map((hunt) => ({
        ...hunt,
        bought: hunt.cards.filter((card) => card.huntStatus === 'bought').length,
        skipped: hunt.cards.filter((card) => card.huntStatus === 'skipped').length,
        missed: hunt.cards.filter((card) => card.huntStatus === 'missed').length,
      }))
      .sort(
        (a, b) =>
          new Date(b.event?.starts_at || 0).getTime() -
          new Date(a.event?.starts_at || 0).getTime()
      )
  }, [rows])

  const totalBought = hunts.reduce((sum, hunt) => sum + hunt.bought, 0)
  const totalSkipped = hunts.reduce((sum, hunt) => sum + hunt.skipped, 0)
  const totalHunts = hunts.length

  if (loading) {
    return <p className="text-sm text-gray-400">Loading past hunts...</p>
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-[#222] bg-[#111] p-3">
          <p className="text-xs text-gray-500">Past Hunts</p>
          <p className="mt-1 text-lg font-bold">{totalHunts}</p>
        </div>

        <div className="rounded-2xl border border-[#222] bg-[#111] p-3">
          <p className="text-xs text-gray-500">Bought</p>
          <p className="mt-1 text-lg font-bold text-green-300">{totalBought}</p>
        </div>

        <div className="rounded-2xl border border-[#222] bg-[#111] p-3">
          <p className="text-xs text-gray-500">Skipped</p>
          <p className="mt-1 text-lg font-bold text-gray-300">{totalSkipped}</p>
        </div>
      </div>

      {message && (
        <p className="mb-4 rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-gray-300">
          {message}
        </p>
      )}

      {hunts.length === 0 ? (
        <div className="rounded-2xl border border-[#222] bg-[#111] p-6 text-center">
          <ShoppingBag className="mx-auto text-gray-600" size={30} />
          <h2 className="mt-3 text-lg font-semibold">No past hunts yet</h2>
          <p className="mt-1 text-sm leading-6 text-gray-400">
            Completed shows will appear here with the cards you bought, skipped,
            or missed.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {hunts.map((hunt) => {
            const expanded = expandedEventId === hunt.eventId

            return (
              <section
                key={hunt.eventId}
                className="overflow-hidden rounded-2xl border border-[#222] bg-[#111]"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedEventId(expanded ? null : hunt.eventId)
                  }
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={16} className="text-yellow-300" />
                        <p className="truncate font-bold text-white">
                          {hunt.event?.name || 'Past Show'}
                        </p>
                      </div>

                      <p className="mt-2 text-xs text-gray-500">
                        {formatDate(hunt.event?.starts_at)}
                        {hunt.event?.city || hunt.event?.state
                          ? ` · ${[hunt.event?.city, hunt.event?.state]
                              .filter(Boolean)
                              .join(', ')}`
                          : ''}
                      </p>
                    </div>

                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-gray-500 transition ${
                        expanded ? 'rotate-180' : ''
                      }`}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-black p-2 text-center">
                      <p className="font-black text-green-300">{hunt.bought}</p>
                      <p className="text-[10px] uppercase tracking-wide text-gray-600">
                        Bought
                      </p>
                    </div>
                    <div className="rounded-xl bg-black p-2 text-center">
                      <p className="font-black text-gray-300">{hunt.skipped}</p>
                      <p className="text-[10px] uppercase tracking-wide text-gray-600">
                        Skipped
                      </p>
                    </div>
                    <div className="rounded-xl bg-black p-2 text-center">
                      <p className="font-black text-gray-500">{hunt.missed}</p>
                      <p className="text-[10px] uppercase tracking-wide text-gray-600">
                        Missed
                      </p>
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-[#222] p-3">
                    <div className="space-y-2">
                      {hunt.cards.map((card) => {
                        const item = card.inventory_items
                        const status = card.huntStatus

                        return (
                          <div
                            key={card.id}
                            className="flex items-center gap-3 rounded-xl bg-black p-3"
                          >
                            {item?.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.card_name || 'Card'}
                                className="h-16 w-11 shrink-0 rounded-md object-contain"
                              />
                            ) : (
                              <div className="h-16 w-11 shrink-0 rounded-md bg-[#1a1a1a]" />
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-white">
                                {item?.card_name || 'Card'}
                              </p>
                              <p className="mt-1 truncate text-[11px] text-gray-600">
                                {item?.set_name || 'Unknown set'}
                                {item?.card_number ? ` #${item.card_number}` : ''}
                              </p>
                              <p className="mt-1 text-xs font-bold text-yellow-300">
                                {formatPrice(item)}
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              {status === 'bought' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-green-300">
                                  <CheckCircle2 size={14} />
                                  Bought
                                </span>
                              ) : status === 'skipped' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-400">
                                  <CircleOff size={14} />
                                  Skipped
                                </span>
                              ) : (
                                <span className="text-xs font-bold text-gray-600">
                                  Missed
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/map?event=${hunt.eventId}&view=hunt`)
                      }
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#333] bg-black p-3 text-sm font-bold text-gray-300"
                    >
                      View Show
                      <ChevronRight size={15} />
                    </button>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

export default BuyingTab
