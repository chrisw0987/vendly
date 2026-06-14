import { useEffect, useMemo, useState } from 'react'
import Navbar from '../components/Navbar'
import {
  CalendarDays,
  Navigation,
  Plus,
  SlidersHorizontal,
  Check,
  Trash2,
  Info,
  X,
  ArrowLeft,
  Search as SearchIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'


function Map() {
  const [activeTab, setActiveTab] = useState('saved')
  const [savedEvents, setSavedEvents] = useState([])
  const [savedEventIds, setSavedEventIds] = useState([])
  const [events, setEvents] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(true)

  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [sortOption, setSortOption] = useState('earliest')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [message, setMessage] = useState('')
  const [savingEventId, setSavingEventId] = useState(null)

  const [selectedEvent, setSelectedEvent] = useState(null)
  const [selectedVendorTable, setSelectedVendorTable] = useState(null)
  const [showBooths, setShowBooths] = useState([])
  const [loadingBooths, setLoadingBooths] = useState(false)
  const [occupiedBooths, setOccupiedBooths] = useState([])
  const [showInventorySearch, setShowInventorySearch] = useState('')
  const [showInventoryResults, setShowInventoryResults] = useState([])
  const [showInventorySearching, setShowInventorySearching] = useState(false)
  const [showInventoryHasSearched, setShowInventoryHasSearched] = useState(false)

  useEffect(() => {
    fetchEvents()
    fetchSavedEvents()
    useUserLocation()
  }, [])

  async function getUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return user
  }

  async function fetchEvents() {
    setLoadingEvents(true)

    const { data, error } = await supabase
      .from('events')
      .select('id, name, city, state, venue, address, starts_at, icon_url, floorplan_url, floorplan_preview_url')
      .order('starts_at', { ascending: true })

    if (error) {
      setMessage(error.message)
      setEvents([])
    } else {
      setEvents(data || [])
    }

    setLoadingEvents(false)
  }

  async function fetchSavedEvents() {
    const user = await getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('saved_events')
      .select(`
        id,
        event_id,
        events (
          id,
          name,
          city,
          state,
          venue,
          address,
          starts_at,
          icon_url,
          floorplan_url,
          floorplan_preview_url
        )
      `)
      .eq('user_id', user.id)

    if (error) {
      setMessage(error.message)
      return
    }

    const saved =
      data
        ?.map((row) => ({
          ...row.events,
          saved_row_id: row.id,
        }))
        .filter(Boolean) || []

    setSavedEvents(saved)
    setSavedEventIds(saved.map((event) => event.id))
  }

  function useUserLocation() {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      () => {
        setMessage('Showing nearby event suggestions.')
      },
      () => {
        setMessage('')
      }
    )
  }

  async function saveEvent(event) {
    const user = await getUser()

    if (!user) {
      setMessage('You must be logged in to save events.')
      return
    }

    setSavingEventId(event.id)
    setMessage('')

    if (savedEventIds.includes(event.id)) {
      setMessage('Event already saved.')
      setSavingEventId(null)
      return
    }

    const { data, error } = await supabase
      .from('saved_events')
      .insert({
        user_id: user.id,
        event_id: event.id,
      })
      .select()
      .single()

    if (error) {
      setMessage(error.code === '23505' ? 'Event already saved.' : error.message)
      setSavingEventId(null)
      return
    }

    setSavedEvents((current) => [
      ...current,
      {
        ...event,
        saved_row_id: data.id,
      },
    ])

    setSavedEventIds((current) => [...current, event.id])
    setMessage('Event saved.')
    setSavingEventId(null)
  }

  async function removeSavedEvent(event) {
    if (!event.saved_row_id) return

    const { error } = await supabase
      .from('saved_events')
      .delete()
      .eq('id', event.saved_row_id)

    if (error) {
      setMessage(error.message)
      return
    }

    setSavedEvents((current) =>
      current.filter((saved) => saved.saved_row_id !== event.saved_row_id)
    )

    setSavedEventIds((current) => current.filter((id) => id !== event.id))
    setMessage('Event removed.')
  }

  async function fetchShowBooths(eventId) {
    if (!eventId) {
      setShowBooths([])
      return
    }

    setLoadingBooths(true)

    const { data, error } = await supabase
      .from('show_booths')
      .select(`
        id,
        event_id,
        booth_code,
        section_label,
        table_number,
        room_name,
        row_order,
        col_order,
        x_position,
        y_position,
        width,
        height
      `)
      .eq('event_id', eventId)
      .order('row_order', { ascending: true })
      .order('col_order', { ascending: true })
      .order('booth_code', { ascending: true })

    if (error) {
      setMessage(error.message)
      setShowBooths([])
    } else {
      setShowBooths(data || [])
    }

    setLoadingBooths(false)
  }

  async function fetchOccupiedBooths(eventId) {
    if (!eventId) {
      setOccupiedBooths([])
      return
    }

    const { data, error } = await supabase
      .from('vendor_event_profiles')
      .select('booth_number')
      .eq('event_id', eventId)
      .eq('public_enabled', true)

    if (error) {
      setOccupiedBooths([])
      return
    }

    setOccupiedBooths(data?.map((row) => row.booth_number).filter(Boolean) || [])
  }

  async function fetchVendorTableDetails(table) {
    const boothCode = table.booth_code || table.tableNumber

    if (!selectedEvent?.id) {
      setSelectedVendorTable({
        ...table,
        tableNumber: boothCode,
        loading: false,
        vendorName: 'No vendor assigned yet',
        inventory: [],
      })
      return
    }

    setSelectedVendorTable({
      ...table,
      tableNumber: boothCode,
      loading: true,
      vendorName: 'Loading...',
      inventory: [],
    })

    const { data: booth, error: boothError } = await supabase
      .from('vendor_event_profiles')
      .select('id, event_id, vendor_id, booth_number, display_name, public_enabled')
      .eq('event_id', selectedEvent.id)
      .eq('booth_number', boothCode)
      .maybeSingle()

    if (boothError) {
      setSelectedVendorTable({
        ...table,
        loading: false,
        vendorName: 'Could not load vendor',
        inventory: [],
      })
      return
    }

    if (!booth || booth.public_enabled === false) {
      setSelectedVendorTable({
        ...table,
        loading: false,
        vendorName: 'No vendor assigned',
        inventory: [],
      })
      return
    }

    const { data: vendor } = await supabase
      .from('users')
      .select('display_name, username')
      .eq('id', booth.vendor_id)
      .maybeSingle()

    const { data: assignedRows, error: assignedError } = await supabase
      .from('show_inventory')
      .select('id, inventory_item_id')
      .eq('event_id', selectedEvent.id)
      .eq('vendor_id', booth.vendor_id)

    const assignedItemIds =
      assignedRows?.map((row) => row.inventory_item_id).filter(Boolean) || []

    const { data: inventoryRows, error: inventoryError } =
      assignedItemIds.length > 0
        ? await supabase
            .from('inventory_items')
            .select(`
              id,
              card_name,
              set_name,
              card_number,
              rarity,
              image_url,
              listing_price,
              market_price,
              quantity,
              condition,
              item_type,
              grade_company,
              grade,
              is_public,
              is_sold
            `)
            .in('id', assignedItemIds)
            .eq('is_public', true)
            .eq('is_sold', false)
        : { data: [], error: null }


    const assignedInventory = inventoryRows || []

    setSelectedVendorTable({
      ...table,
      loading: false,
      vendorId: booth.vendor_id,
      boothNumber: booth.booth_number,
      vendorName:
        booth.display_name ||
        vendor?.username ||
        vendor?.display_name ||
        'Vendor',
      inventory: assignedError || inventoryError ? [] : assignedInventory,
      inventoryError: assignedError?.message || inventoryError?.message || '',
    })
  }


  async function searchAssignedShowInventory() {
    const query = showInventorySearch.trim().toLowerCase()

    if (!selectedEvent?.id || !query) {
      setShowInventoryResults([])
      setShowInventoryHasSearched(false)
      return
    }

    setShowInventorySearching(true)
    setShowInventoryHasSearched(false)

    const { data: assignedRows, error: assignedError } = await supabase
      .from('show_inventory')
      .select(`
        id,
        vendor_id,
        inventory_items (
          id,
          card_name,
          set_name,
          card_number,
          rarity,
          image_url,
          listing_price,
          market_price,
          quantity,
          condition,
          item_type,
          grade_company,
          grade,
          is_public,
          is_sold
        )
      `)
      .eq('event_id', selectedEvent.id)

    if (assignedError) {
      setMessage(assignedError.message)
      setShowInventoryResults([])
      setShowInventorySearching(false)
      return
    }

    const matchingRows =
      assignedRows
        ?.map((row) => ({
          ...row,
          item: row.inventory_items,
        }))
        .filter(({ item }) => {
          if (!item || !item.is_public || item.is_sold) return false

          const searchableText = [
            item.card_name,
            item.set_name,
            item.card_number,
            item.rarity,
            item.condition,
            item.grade_company,
            item.grade,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

          return searchableText.includes(query)
        }) || []

    const vendorIds = [
      ...new Set(matchingRows.map((row) => row.vendor_id).filter(Boolean)),
    ]

    if (vendorIds.length === 0) {
      setShowInventoryResults([])
      setShowInventorySearching(false)
      setShowInventoryHasSearched(true)
      return
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('vendor_event_profiles')
      .select('vendor_id, booth_number, display_name, public_enabled')
      .eq('event_id', selectedEvent.id)
      .in('vendor_id', vendorIds)
      .eq('public_enabled', true)

    if (profilesError) {
      setMessage(profilesError.message)
      setShowInventoryResults([])
      setShowInventorySearching(false)
      setShowInventoryHasSearched(true)
      return
    }

    const profileMap = new globalThis.Map(
      (profiles || []).map((profile) => [profile.vendor_id, profile])
    )

    const results = matchingRows
      .map((row) => {
        const profile = profileMap.get(row.vendor_id)
        if (!profile) return null

        return {
          id: row.id,
          item: row.item,
          vendorId: row.vendor_id,
          vendorName: profile.display_name || 'Vendor',
          boothNumber: profile.booth_number,
        }
      })
      .filter(Boolean)

    setShowInventoryResults(results)
    setShowInventorySearching(false)
    setShowInventoryHasSearched(true)
  }

  function clearShowInventorySearch() {
    setShowInventorySearch('')
    setShowInventoryResults([])
    setShowInventoryHasSearched(false)
  }

  function openSearchResultBooth(result) {
    if (!result?.boothNumber) return

    fetchVendorTableDetails({
      id: `booth-${result.boothNumber}`,
      booth_code: result.boothNumber,
      tableNumber: result.boothNumber,
    })
  }

  function getItemName(item) {
    return item.card_name || item.name || item.item_name || item.title || 'Unnamed item'
  }

  function getItemSet(item) {
    return item.set_name || item.set || item.expansion || ''
  }

  function getItemPrice(item) {
    return item.listing_price || item.price || item.market_price || item.tcg_price || null
  }

  function getDirections(event) {
    const query = encodeURIComponent(
      event.address || `${event.venue || ''} ${event.city || ''} ${event.state || ''}`
    )

    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank')
  }

  function formatDate(eventDate) {
    if (!eventDate) return 'TBD'

    return new Date(eventDate).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  }

  function formatTime(eventDate) {
    if (!eventDate) return ''

    return new Date(eventDate).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function sortEvents(list) {
    const sorted = [...list]

    switch (sortOption) {
      case 'az':
        return sorted.sort((a, b) => a.name.localeCompare(b.name))
      case 'za':
        return sorted.sort((a, b) => b.name.localeCompare(a.name))
      case 'latest':
        return sorted.sort(
          (a, b) => new Date(b.starts_at || 0) - new Date(a.starts_at || 0)
        )
      case 'earliest':
      default:
        return sorted.sort(
          (a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0)
        )
    }
  }

  async function openMoreInfo(event) {
    setSelectedEvent(event)
    setSelectedVendorTable(null)
    clearShowInventorySearch()
    await Promise.all([fetchShowBooths(event.id), fetchOccupiedBooths(event.id)])
  }

  function closeModals() {
    setSelectedEvent(null)
    setSelectedVendorTable(null)
    setShowBooths([])
    setOccupiedBooths([])
    clearShowInventorySearch()
  }

  const filteredExploreEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesSearch =
        !search ||
        event.name.toLowerCase().includes(search.toLowerCase()) ||
        event.venue?.toLowerCase().includes(search.toLowerCase())

      const matchesCity = !city || event.city?.toLowerCase().includes(city.toLowerCase())
      const matchesState = !state || event.state?.toLowerCase().includes(state.toLowerCase())

      return matchesSearch && matchesCity && matchesState
    })
  }, [events, search, city, state])

  const displayEvents =
    activeTab === 'saved' ? sortEvents(savedEvents) : sortEvents(filteredExploreEvents)

  const groupedShowBooths = useMemo(() => {
    const groups = {}

    showBooths.forEach((booth) => {
      const roomName = booth.room_name || 'Main Room'

      if (!groups[roomName]) groups[roomName] = []

      groups[roomName].push(booth)
    })

    return Object.entries(groups).map(([roomName, booths]) => ({
      roomName,
      booths: booths.sort((a, b) => {
        const rowDiff = Number(a.row_order || 0) - Number(b.row_order || 0)
        if (rowDiff !== 0) return rowDiff

        const colDiff = Number(a.col_order || 0) - Number(b.col_order || 0)
        if (colDiff !== 0) return colDiff

        return String(a.booth_code || '').localeCompare(String(b.booth_code || ''))
      }),
    }))
  }, [showBooths])

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <main className="mx-auto max-w-[430px] px-5 pt-8">
        <div className="mb-6 flex justify-center rounded-2xl border border-[#222] bg-[#111] p-1">
          <button
            onClick={() => setActiveTab('saved')}
            className={`w-1/2 rounded-xl py-3 text-sm font-semibold ${
              activeTab === 'saved' ? 'bg-white text-black' : 'text-gray-400'
            }`}
          >
            My Saved Events
          </button>

          <button
            onClick={() => setActiveTab('explore')}
            className={`w-1/2 rounded-xl py-3 text-sm font-semibold ${
              activeTab === 'explore' ? 'bg-white text-black' : 'text-gray-400'
            }`}
          >
            Explore
          </button>
        </div>

        {activeTab === 'explore' && (
          <div className="mb-5 space-y-3">
            <input
              placeholder="Search shows"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-[#222] bg-[#111] p-4 text-white outline-none"
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
              />

              <input
                placeholder="State"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
              />
            </div>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {activeTab === 'saved' ? 'Saved Shows' : 'Explore Shows'}
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              {activeTab === 'saved'
                ? 'Events you saved, ordered by date.'
                : 'Find nearby card shows and events.'}
            </p>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="rounded-xl border border-[#222] bg-[#111] p-3"
            >
              <SlidersHorizontal size={18} />
            </button>

            {showSortMenu && (
              <div className="absolute right-0 z-40 mt-2 w-48 rounded-xl border border-[#222] bg-[#111] p-2 shadow-xl">
                {[
                  ['earliest', 'Earliest First'],
                  ['latest', 'Latest First'],
                  ['az', 'Alphabetical A-Z'],
                  ['za', 'Alphabetical Z-A'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => {
                      setSortOption(value)
                      setShowSortMenu(false)
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#1a1a1a] ${
                      sortOption === value ? 'text-yellow-300' : 'text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {message && (
          <p className="mb-4 rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-gray-300">
            {message}
          </p>
        )}

        {loadingEvents && activeTab === 'explore' ? (
          <p className="text-sm text-gray-400">Loading shows...</p>
        ) : displayEvents.length === 0 ? (
          <div className="rounded-2xl border border-[#222] bg-[#111] p-6 text-center">
            <CalendarDays className="mx-auto mb-3 text-gray-500" size={36} />
            <h2 className="text-lg font-semibold">
              {activeTab === 'saved' ? 'No saved events yet' : 'No shows found'}
            </h2>
          </div>
        ) : (
          <div className="space-y-3">
            {displayEvents.map((event) => {
              const isSaved = savedEventIds.includes(event.id)
              const isSaving = savingEventId === event.id

              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-[#222] bg-[#111] p-4"
                >
                  <div className="flex gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1a1a1a]">
                      {event.icon_url ? (
                        <img
                          src={event.icon_url}
                          alt={event.name}
                          className="h-10 w-10 rounded-xl object-cover"
                        />
                      ) : (
                        <CalendarDays className="text-gray-400" size={26} />
                      )}
                    </div>

                    <div className="flex-1">
                      <p className="font-semibold">{event.name}</p>
                      <p className="mt-1 text-sm text-gray-400">
                        {event.venue || 'Venue TBD'}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {event.city}, {event.state}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xl font-bold text-yellow-300">
                        {formatDate(event.starts_at)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatTime(event.starts_at)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-[1fr_1fr_48px] gap-2">
                    <button
                      onClick={() => getDirections(event)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-[#222] bg-black p-3 text-sm font-semibold"
                    >
                      <Navigation size={16} />
                      Directions
                    </button>

                    <button
                      onClick={() => openMoreInfo(event)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-[#222] bg-black p-3 text-sm font-semibold"
                    >
                      <Info size={16} />
                      More Info
                    </button>

                    {activeTab === 'saved' ? (
                      <button
                        onClick={() => removeSavedEvent(event)}
                        className="flex h-12 items-center justify-center rounded-xl border border-red-900 bg-red-950/30 text-red-300"
                      >
                        <Trash2 size={17} />
                      </button>
                    ) : (
                      <button
                        onClick={() => saveEvent(event)}
                        disabled={isSaved || isSaving}
                        className={`flex h-12 items-center justify-center rounded-xl ${
                          isSaved ? 'bg-green-950 text-green-300' : 'bg-white text-black'
                        } disabled:opacity-70`}
                      >
                        {isSaved ? <Check size={17} /> : <Plus size={17} />}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-4">
          <div className="max-h-[88vh] w-full max-w-[430px] overflow-y-auto rounded-3xl border border-[#222] bg-[#111] p-5">
            {!selectedVendorTable ? (
              <>
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold">{selectedEvent.name}</h2>
                    <p className="mt-1 text-sm text-gray-400">
                      {selectedEvent.venue || 'Venue TBD'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {selectedEvent.city}, {selectedEvent.state}
                    </p>
                  </div>

                  <button
                    onClick={closeModals}
                    className="rounded-full border border-[#222] bg-black p-2"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="mb-4 rounded-2xl border border-[#222] bg-black p-4">
                  <p className="text-sm text-gray-400">Event starts</p>
                  <p className="mt-1 font-semibold">
                    {formatDate(selectedEvent.starts_at)} at{' '}
                    {formatTime(selectedEvent.starts_at)}
                  </p>
                </div>

                <div className="mb-5 rounded-2xl border border-[#222] bg-black p-4">
                  <h3 className="mb-3 text-lg font-semibold">Search This Show</h3>

                  <div className="flex items-center rounded-xl border border-[#222] bg-[#111] px-3">
                    <SearchIcon size={17} className="text-gray-500" />
                    <input
                      placeholder="Search cards at this show"
                      value={showInventorySearch}
                      onChange={(e) => {
                        setShowInventorySearch(e.target.value)
                        setShowInventoryHasSearched(false)
                        if (!e.target.value.trim()) setShowInventoryResults([])
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') searchAssignedShowInventory()
                      }}
                      className="w-full bg-transparent p-3 text-sm text-white outline-none"
                    />
                    {showInventorySearch && (
                      <button
                        onClick={clearShowInventorySearch}
                        className="text-gray-500 hover:text-white"
                      >
                        <X size={17} />
                      </button>
                    )}
                  </div>

                  <button
                    onClick={searchAssignedShowInventory}
                    disabled={!showInventorySearch.trim() || showInventorySearching}
                    className="mt-3 w-full rounded-xl bg-white p-3 text-sm font-bold text-black disabled:opacity-50"
                  >
                    {showInventorySearching ? 'Searching...' : 'Search Show Inventory'}
                  </button>

                  {showInventoryResults.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {showInventoryResults.map((result) => {
                        const item = result.item
                        const price = getItemPrice(item)

                        return (
                          <button
                            key={result.id}
                            onClick={() => openSearchResultBooth(result)}
                            className="w-full rounded-xl border border-[#222] bg-[#111] p-3 text-left transition hover:border-green-900 hover:bg-green-950/10"
                          >
                            <div className="flex gap-3">
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={getItemName(item)}
                                  className="h-20 w-14 shrink-0 rounded-lg object-contain"
                                />
                              ) : (
                                <div className="h-20 w-14 shrink-0 rounded-lg bg-[#1a1a1a]" />
                              )}

                              <div className="min-w-0 flex-1">
                                <p className="font-semibold">{getItemName(item)}</p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {getItemSet(item)}
                                  {item.card_number ? ` #${item.card_number}` : ''}
                                </p>
                                <p className="mt-1 text-xs text-green-300">
                                  Booth {result.boothNumber} · {result.vendorName}
                                </p>
                                {price && (
                                  <p className="mt-1 text-sm font-bold text-yellow-300">
                                    ${Number(price).toFixed(2)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {showInventoryHasSearched &&
                    showInventorySearch.trim() &&
                    !showInventorySearching &&
                    showInventoryResults.length === 0 && (
                      <p className="mt-3 rounded-xl border border-[#222] bg-[#111] p-3 text-center text-sm text-gray-500">
                        No matching public cards assigned to this show yet.
                      </p>
                    )}
                </div>


                {selectedEvent.floorplan_url && (
                  <div className="mb-5 rounded-2xl border border-[#222] bg-black p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold">Official Floorplan</h3>
                      <button
                        onClick={() => window.open(selectedEvent.floorplan_url, '_blank')}
                        className="rounded-lg border border-[#222] bg-[#111] px-3 py-2 text-xs font-semibold text-gray-300 hover:text-white"
                      >
                        Open Full
                      </button>
                    </div>

                    {selectedEvent.floorplan_preview_url ? (
                      <button
                        onClick={() => window.open(selectedEvent.floorplan_url, '_blank')}
                        className="w-full overflow-hidden rounded-xl border border-[#222] bg-[#111]"
                      >
                        <img
                          src={selectedEvent.floorplan_preview_url}
                          alt={`${selectedEvent.name} floorplan preview`}
                          className="max-h-64 w-full object-contain p-2"
                        />
                      </button>
                    ) : (
                      <button
                        onClick={() => window.open(selectedEvent.floorplan_url, '_blank')}
                        className="flex w-full flex-col items-center justify-center rounded-xl border border-[#222] bg-[#111] p-6 text-center"
                      >
                        <CalendarDays className="mb-3 text-yellow-300" size={34} />
                        <p className="font-semibold">Floorplan file available</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Preview unavailable. Tap to open the full floorplan.
                        </p>
                      </button>
                    )}

                    <p className="mt-2 text-center text-xs text-gray-500">
                      Tap to open the full floorplan.
                    </p>
                  </div>
                )}

                <h3 className="mb-3 text-lg font-semibold">Venue Map</h3>

                <div className="rounded-2xl border border-[#222] bg-black p-4">
                  <div className="mb-4 rounded-xl border border-dashed border-[#333] p-3 text-center text-xs text-gray-500">
                    Entrance
                  </div>

                  {loadingBooths ? (
                    <div className="rounded-xl border border-[#222] bg-[#111] p-5 text-center">
                      <p className="text-sm text-gray-400">Loading booth layout...</p>
                    </div>
                  ) : groupedShowBooths.length === 0 ? (
                    <div className="rounded-xl border border-[#222] bg-[#111] p-5 text-center">
                      <p className="text-sm text-gray-400">
                        No booth layout has been added for this show yet.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {groupedShowBooths.map((group) => (
                        <div key={group.roomName}>
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-300">
                              {group.roomName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {group.booths.length} booths
                            </p>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            {group.booths.map((booth) => {
                              const boothCode = booth.booth_code
                              const hasVendor = occupiedBooths.includes(boothCode)

                              return (
                                <button
                                  key={booth.id}
                                  onClick={() =>
                                    fetchVendorTableDetails({
                                      ...booth,
                                      tableNumber: boothCode,
                                    })
                                  }
                                  className={`rounded-xl p-4 text-center transition hover:scale-[1.02] ${
                                    hasVendor
                                      ? 'border border-green-900 bg-green-950/30 text-green-300'
                                      : 'border border-[#333] bg-[#161616] text-gray-400'
                                  }`}
                                >
                                  <p className="text-lg font-bold">{boothCode}</p>
                                  <p className="mt-1 text-xs">
                                    {hasVendor ? 'Vendor assigned' : 'Empty'}
                                  </p>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 rounded-xl border border-dashed border-[#333] p-3 text-center text-xs text-gray-500">
                    Food / Rest Area
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-5 flex items-center justify-between">
                  <button
                    onClick={() => setSelectedVendorTable(null)}
                    className="flex items-center gap-2 rounded-xl border border-[#222] bg-black px-3 py-2 text-sm font-semibold"
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>

                  <button
                    onClick={closeModals}
                    className="rounded-full border border-[#222] bg-black p-2"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="rounded-2xl border border-[#222] bg-black p-4">
                  <p className="text-sm text-gray-400">
                    Booth {selectedVendorTable.boothNumber || selectedVendorTable.tableNumber}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold">
                    {selectedVendorTable.vendorName}
                  </h2>
                </div>

                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Assigned Show Inventory</h3>
                    {!selectedVendorTable.loading && (
                      <p className="text-xs text-gray-500">
                        {selectedVendorTable.inventory.length} cards
                      </p>
                    )}
                  </div>

                  {selectedVendorTable.loading ? (
                    <div className="rounded-2xl border border-[#222] bg-black p-5 text-center">
                      <p className="text-sm text-gray-400">Loading inventory...</p>
                    </div>
                  ) : selectedVendorTable.inventoryError ? (
                    <div className="rounded-2xl border border-[#222] bg-black p-5 text-center">
                      <p className="text-sm text-red-300">
                        {selectedVendorTable.inventoryError}
                      </p>
                    </div>
                  ) : selectedVendorTable.inventory.length === 0 ? (
                    <div className="rounded-2xl border border-[#222] bg-black p-5 text-center">
                      <p className="text-sm text-gray-400">
                        This vendor has not assigned any public cards to this show yet.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedVendorTable.inventory.map((item) => {
                        const price = getItemPrice(item)

                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-[#222] bg-black p-3"
                          >
                            <div className="flex gap-3">
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={getItemName(item)}
                                  className="h-24 w-16 shrink-0 rounded-lg object-contain"
                                />
                              ) : (
                                <div className="h-24 w-16 shrink-0 rounded-lg bg-[#1a1a1a]" />
                              )}

                              <div className="min-w-0 flex-1">
                                <p className="font-medium">{getItemName(item)}</p>

                                {getItemSet(item) && (
                                  <p className="mt-1 text-sm text-gray-500">
                                    {getItemSet(item)}
                                    {item.card_number ? ` #${item.card_number}` : ''}
                                  </p>
                                )}

                                <p className="mt-1 text-xs text-gray-500">
                                  Qty {item.quantity || 1}
                                  {item.item_type === 'graded'
                                    ? ` · ${item.grade_company || 'Graded'} ${item.grade || ''}`
                                    : item.condition
                                    ? ` · ${item.condition}`
                                    : ''}
                                </p>

                                {price && (
                                  <p className="mt-2 text-sm font-semibold text-yellow-300">
                                    ${Number(price).toFixed(2)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Navbar />
    </div>
  )
}

export default Map
