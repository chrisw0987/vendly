import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
  CheckCircle2,
  User,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../pages/AuthContext'


function Map() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    user: authUser,
    accountType: authAccountType,
    authReady,
  } = useAuth()
  const searchSectionRef = useRef(null)
  const huntSectionRef = useRef(null)
  const floorplanSectionRef = useRef(null)

  const [activeTab, setActiveTab] = useState('explore')
  const [currentUser, setCurrentUser] = useState(null)
  const [accountType, setAccountType] = useState('user')
  const [showGuestPrompt, setShowGuestPrompt] = useState(false)
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
  const [showInventoryType, setShowInventoryType] = useState('all')
  const [showInventorySort, setShowInventorySort] = useState('price-low')
  const [showHuntItems, setShowHuntItems] = useState([])
  const [loadingShowHunt, setLoadingShowHunt] = useState(false)
  const [showAllHuntItems, setShowAllHuntItems] = useState(false)
  const [huntStatuses, setHuntStatuses] = useState({})
  const [updatingHuntStatusId, setUpdatingHuntStatusId] = useState(null)
  const [showHuntVisible, setShowHuntVisible] = useState(false)

  const [vendorInventorySearch, setVendorInventorySearch] = useState('')
  const [vendorInventoryType, setVendorInventoryType] = useState('all')
  const [vendorInventorySort, setVendorInventorySort] = useState('name-asc')

  useEffect(() => {
    if (!authReady) return
    initializeMap(authUser, authAccountType)
  }, [authReady, authUser, authAccountType])

  async function initializeMap(user, resolvedAccountType) {
    setCurrentUser(user || null)

    const params = new URLSearchParams(location.search)
    const isProtectedHuntLink =
      params.get('view') === 'hunt' && Boolean(params.get('event'))

    if (!user && isProtectedHuntLink) {
      const returnTo = `${location.pathname}${location.search}`

      navigate(
        `/?returnTo=${encodeURIComponent(returnTo)}`,
        { replace: true }
      )
      return
    }

    if (user) {
      setAccountType(resolvedAccountType || 'user')
      fetchSavedEvents(resolvedAccountType || 'user')
      fetchEvents(resolvedAccountType || 'user')
    } else {
      setAccountType('user')
      setActiveTab('explore')
      fetchEvents('user')
    }
    useUserLocation()
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const eventId = params.get('event')

    if (!eventId || events.length === 0) return

    const event = events.find((item) => item.id === eventId)
    if (!event) return

    setActiveTab(savedEventIds.includes(eventId) ? 'saved' : 'explore')
    openMoreInfo(event)
  }, [location.search, events, savedEventIds])

  useEffect(() => {
    if (!selectedEvent) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [selectedEvent])

  useEffect(() => {
    if (!selectedEvent) return undefined

    const params = new URLSearchParams(location.search)
    const view = params.get('view')
    let cancelled = false
    let timeout

    async function loadSelectedEventView() {
      if (currentUser) {
        await fetchShowHunt(selectedEvent.id)
      } else {
        setShowHuntItems([])
        setHuntStatuses({})
        setShowHuntVisible(false)
      }

      if (cancelled) return

      timeout = setTimeout(() => {
        const targetRef =
          view === 'hunt'
            ? huntSectionRef
            : view === 'floorplan'
            ? floorplanSectionRef
            : view === 'search'
            ? searchSectionRef
            : null

        targetRef?.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }, view === 'hunt' ? 350 : 200)
    }

    loadSelectedEventView()

    return () => {
      cancelled = true
      if (timeout) clearTimeout(timeout)
    }
  }, [selectedEvent, location.search, currentUser])

  async function getUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return user
  }

  async function fetchEvents(accountTypeOverride = accountType) {
    setLoadingEvents(true)

    const { data, error } = await supabase
      .from('events')
      .select('id, name, city, state, venue, address, starts_at, end_date, icon_url, floorplan_url, floorplan_preview_url')
      .order('starts_at', { ascending: true })

    if (error) {
      setMessage(error.message)
      setEvents([])
    } else {
      const nextEvents = (data || []).filter(isCurrentOrUpcomingEvent)
      setEvents(nextEvents)
    }

    setLoadingEvents(false)
  }

  async function fetchSavedEvents(accountTypeOverride = accountType) {
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
          end_date,
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
        .filter(Boolean)
        .filter(isCurrentOrUpcomingEvent) || []

    setSavedEvents(saved)
    setSavedEventIds(saved.map((event) => event.id))
  }


  function getEventEndTimestamp(event) {
    if (event?.end_date) {
      const end = new Date(`${event.end_date}T23:59:59.999`)
      return Number.isNaN(end.getTime()) ? null : end.getTime()
    }

    if (event?.starts_at) {
      const start = new Date(event.starts_at)
      if (Number.isNaN(start.getTime())) return null

      const endOfStartDay = new Date(start)
      endOfStartDay.setHours(23, 59, 59, 999)
      return endOfStartDay.getTime()
    }

    return null
  }

  function isPastEvent(event) {
    const endTimestamp = getEventEndTimestamp(event)
    return endTimestamp !== null && endTimestamp < Date.now()
  }

  function isCurrentOrUpcomingEvent(event) {
    return !isPastEvent(event)
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
      setShowGuestPrompt(true)
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
      .select('booth_number, vendor_id, display_name')
      .eq('event_id', eventId)
      .eq('public_enabled', true)

    if (error) {
      setOccupiedBooths([])
      return
    }

    const vendorIds = [
      ...new Set((data || []).map((row) => row.vendor_id).filter(Boolean)),
    ]

    let profileImageMap = new globalThis.Map()

    if (vendorIds.length > 0) {
      const { data: vendorProfiles, error: vendorProfilesError } =
        await supabase.rpc('get_public_vendor_profiles', {
          vendor_ids: vendorIds,
        })

      if (vendorProfilesError) {
        console.warn(
          'Unable to load public vendor profile photos:',
          vendorProfilesError
        )
      }

      profileImageMap = new globalThis.Map(
        (vendorProfiles || []).map((profile) => [
          profile.id,
          profile.profile_image_url || '',
        ])
      )
    }

    setOccupiedBooths(
      (data || [])
        .filter((row) => row.booth_number)
        .map((row) => ({
          boothNumber: row.booth_number,
          vendorId: row.vendor_id,
          vendorName: row.display_name || 'Vendor',
          profileImageUrl: profileImageMap.get(row.vendor_id) || '',
        }))
    )
  }

  async function fetchVendorTableDetails(table) {
    const boothCode = table.booth_code || table.tableNumber

    setVendorInventorySearch('')
    setVendorInventoryType('all')
    setVendorInventorySort('name-asc')

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

    const { data: vendorUserProfiles, error: vendorUserProfileError } =
      await supabase.rpc('get_public_vendor_profiles', {
        vendor_ids: [booth.vendor_id],
      })

    if (vendorUserProfileError) {
      console.warn(
        'Unable to load public vendor profile photo:',
        vendorUserProfileError
      )
    }

    const vendorUserProfile = vendorUserProfiles?.[0] || null

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
      vendorName: booth.display_name || 'Vendor',
      profileImageUrl: vendorUserProfile?.profile_image_url || '',
      inventory: assignedError || inventoryError ? [] : assignedInventory,
      inventoryError: assignedError?.message || inventoryError?.message || '',
    })
  }


  async function fetchShowHunt(eventId) {
    if (!currentUser || !eventId) {
      setShowHuntItems([])
      setHuntStatuses({})
      setShowHuntVisible(false)
      return
    }

    setShowAllHuntItems(false)
    setShowHuntVisible(false)
    setLoadingShowHunt(true)

    const { error: syncError } = await supabase.rpc('sync_user_show_hunt', {
      p_event_id: eventId,
    })

    if (syncError) {
      console.error('Show hunt sync failed:', syncError)
      setShowHuntItems([])
      setHuntStatuses({})
      setShowHuntVisible(false)
      setLoadingShowHunt(false)
      return
    }

    const { data: huntRows, error: huntError } = await supabase
      .from('show_hunt_entries')
      .select(`
        id,
        event_id,
        wishlist_item_id,
        inventory_item_id,
        vendor_id,
        card_id,
        card_name,
        set_name,
        card_number,
        rarity,
        image_url,
        item_type,
        condition,
        grade_company,
        grade,
        listing_price,
        market_price,
        quantity,
        vendor_name,
        booth_number,
        status,
        listing_available,
        unavailable_reason,
        finalized_at,
        created_at,
        updated_at
      `)
      .eq('user_id', currentUser.id)
      .eq('event_id', eventId)
      .is('finalized_at', null)
      .order('booth_number', { ascending: true })
      .order('created_at', { ascending: true })

    if (huntError) {
      console.error('Show hunt load failed:', huntError)
      setShowHuntItems([])
      setHuntStatuses({})
      setShowHuntVisible(false)
      setLoadingShowHunt(false)
      return
    }

    const hydrated = (huntRows || []).map((row) => ({
      id: row.id,
      wishlist_item_id: row.wishlist_item_id,
      inventory_item_id: row.inventory_item_id,
      vendor_id: row.vendor_id,
      vendorName: row.vendor_name || 'Vendor',
      boothNumber: row.booth_number || '',
      status: row.status || 'hunting',
      listingAvailable: row.listing_available !== false,
      unavailableReason: row.unavailable_reason || '',
      item: {
        id: row.inventory_item_id,
        card_id: row.card_id,
        card_name: row.card_name,
        set_name: row.set_name,
        card_number: row.card_number,
        rarity: row.rarity,
        image_url: row.image_url,
        listing_price: row.listing_price,
        market_price: row.market_price,
        quantity: row.quantity,
        condition: row.condition,
        item_type: row.item_type,
        grade_company: row.grade_company,
        grade: row.grade,
        is_public: row.listing_available !== false,
        is_sold: false,
      },
    }))

    setShowHuntItems(hydrated)
    setShowHuntVisible(hydrated.length > 0)
    setHuntStatuses(
      Object.fromEntries(
        hydrated.map((row) => [
          row.inventory_item_id || row.id,
          row.status || 'hunting',
        ])
      )
    )
    setLoadingShowHunt(false)
  }

  async function updateHuntStatus(match, nextStatus) {
    if (!currentUser || !selectedEvent?.id || !match?.id) return

    const statusKey = match.inventory_item_id || match.id
    setUpdatingHuntStatusId(statusKey)

    const currentStatus = huntStatuses[statusKey] || 'hunting'
    const resolvedStatus =
      currentStatus === nextStatus ? 'hunting' : nextStatus

    const { error } = await supabase
      .from('show_hunt_entries')
      .update({
        status: resolvedStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.id)
      .eq('user_id', currentUser.id)

    if (error) {
      setMessage(error.message)
      setUpdatingHuntStatusId(null)
      return
    }

    setHuntStatuses((current) => ({
      ...current,
      [statusKey]: resolvedStatus,
    }))

    setShowHuntItems((current) =>
      current.map((item) =>
        item.id === match.id ? { ...item, status: resolvedStatus } : item
      )
    )

    setUpdatingHuntStatusId(null)
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

    const { data: vendorUsers, error: vendorUsersError } =
      await supabase.rpc('get_public_vendor_profiles', {
        vendor_ids: vendorIds,
      })

    if (vendorUsersError) {
      console.warn(
        'Unable to load public vendor profile photos for search:',
        vendorUsersError
      )
    }

    const vendorImageMap = new globalThis.Map(
      (vendorUsers || []).map((profile) => [
        profile.id,
        profile.profile_image_url || '',
      ])
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
          profileImageUrl: vendorImageMap.get(row.vendor_id) || '',
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
    setShowInventoryType('all')
    setShowInventorySort('price-low')
  }

  function openSearchResultBooth(result) {
    if (!result?.boothNumber) return

    fetchVendorTableDetails({
      id: `booth-${result.boothNumber}`,
      booth_code: result.boothNumber,
      tableNumber: result.boothNumber,
      profileImageUrl: result.profileImageUrl || '',
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
      `${event.venue || ''} ${event.city || ''} ${event.state || ''}`|| event.address
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
    if (isPastEvent(event)) {
      setMessage('This show has ended and is no longer accessible from the Map.')
      return
    }

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
    setVendorInventorySearch('')
    setVendorInventoryType('all')
    setVendorInventorySort('name-asc')
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

  const visibleShowInventoryResults = useMemo(() => {
    const filtered = showInventoryResults.filter((result) => {
      const itemType = String(result?.item?.item_type || '').toLowerCase()

      return (
        showInventoryType === 'all' ||
        itemType === showInventoryType
      )
    })

    return [...filtered].sort((a, b) => {
      const aPrice = Number(getItemPrice(a.item))
      const bPrice = Number(getItemPrice(b.item))
      const aHasPrice = Number.isFinite(aPrice) && aPrice > 0
      const bHasPrice = Number.isFinite(bPrice) && bPrice > 0

      switch (showInventorySort) {
        case 'price-high':
          if (aHasPrice && !bHasPrice) return -1
          if (!aHasPrice && bHasPrice) return 1
          return (bHasPrice ? bPrice : 0) - (aHasPrice ? aPrice : 0)
        case 'name-asc':
          return getItemName(a.item).localeCompare(getItemName(b.item))
        case 'name-desc':
          return getItemName(b.item).localeCompare(getItemName(a.item))
        case 'price-low':
        default:
          if (aHasPrice && !bHasPrice) return -1
          if (!aHasPrice && bHasPrice) return 1
          return (aHasPrice ? aPrice : 0) - (bHasPrice ? bPrice : 0)
      }
    })
  }, [showInventoryResults, showInventoryType, showInventorySort])

  const huntStatusCounts = useMemo(() => {
    return showHuntItems.reduce(
      (counts, match) => {
        const status = huntStatuses[match.inventory_item_id || match.id] || match.status || 'hunting'
        counts[status] += 1
        return counts
      },
      { hunting: 0, bought: 0, skipped: 0 }
    )
  }, [showHuntItems, huntStatuses])

  const visibleVendorInventory = useMemo(() => {
    const inventory = selectedVendorTable?.inventory || []
    const query = vendorInventorySearch.trim().toLowerCase()

    const filtered = inventory.filter((item) => {
      const matchesSearch =
        !query ||
        [
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
          .includes(query)

      const matchesType =
        vendorInventoryType === 'all' ||
        String(item.item_type || '').toLowerCase() === vendorInventoryType

      return matchesSearch && matchesType
    })

    return [...filtered].sort((a, b) => {
      const aPrice = Number(getItemPrice(a))
      const bPrice = Number(getItemPrice(b))
      const aHasPrice = Number.isFinite(aPrice) && aPrice > 0
      const bHasPrice = Number.isFinite(bPrice) && bPrice > 0

      switch (vendorInventorySort) {
        case 'price-low':
          if (aHasPrice && !bHasPrice) return -1
          if (!aHasPrice && bHasPrice) return 1
          return (aHasPrice ? aPrice : 0) - (bHasPrice ? bPrice : 0)
        case 'price-high':
          if (aHasPrice && !bHasPrice) return -1
          if (!aHasPrice && bHasPrice) return 1
          return (bHasPrice ? bPrice : 0) - (aHasPrice ? aPrice : 0)
        case 'name-desc':
          return getItemName(b).localeCompare(getItemName(a))
        case 'name-asc':
        default:
          return getItemName(a).localeCompare(getItemName(b))
      }
    })
  }, [
    selectedVendorTable,
    vendorInventorySearch,
    vendorInventoryType,
    vendorInventorySort,
  ])

  if (!authReady) {
    return <div className="min-h-screen bg-black" />
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <main className="mx-auto max-w-[430px] px-5 pt-8">
        {!currentUser && (
          <section className="mb-6 rounded-3xl border border-yellow-800/60 bg-gradient-to-br from-yellow-400/15 via-[#111] to-black p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="rounded-full border border-yellow-800/70 bg-yellow-950/40 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-yellow-300">
                Browsing as Guest
              </span>

              <button
                type="button"
                onClick={() => navigate('/?mode=signup&returnTo=/map')}
                className="text-xs font-bold text-white underline decoration-gray-700 underline-offset-4"
              >
                Sign Up
              </button>
            </div>

            <h2 className="text-3xl font-black leading-[1.08] text-white">
              Hunting for a card? See who&apos;s bringing it.
            </h2>

            <p className="mt-3 text-sm leading-6 text-gray-400">
              Open an upcoming show, search its vendor inventory, and find the booth carrying the card before you arrive.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => navigate('/search')}
                className="rounded-xl bg-white p-3 text-sm font-black text-black"
              >
                Search Cards
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('explore')
                  requestAnimationFrame(() => {
                    document.querySelector('input[placeholder="Search shows"]')?.focus()
                  })
                }}
                className="rounded-xl border border-[#333] bg-black p-3 text-sm font-bold text-white"
              >
                Browse Shows
              </button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center">
              <div>
                <p className="text-xs font-bold text-white">1. Choose</p>
                <p className="mt-1 text-[10px] leading-4 text-gray-600">Open a show</p>
              </div>
              <div>
                <p className="text-xs font-bold text-white">2. Search</p>
                <p className="mt-1 text-[10px] leading-4 text-gray-600">Find your card</p>
              </div>
              <div>
                <p className="text-xs font-bold text-white">3. Visit</p>
                <p className="mt-1 text-[10px] leading-4 text-gray-600">Go to the booth</p>
              </div>
            </div>
          </section>
        )}

        <div className="mb-6 flex justify-center rounded-2xl border border-[#222] bg-[#111] p-1">
          <button
            onClick={() => {
              if (!currentUser) {
                setShowGuestPrompt(true)
                return
              }
              setActiveTab('saved')
            }}
            className={`w-1/2 rounded-xl py-3 text-sm font-semibold ${
              activeTab === 'saved' ? 'bg-white text-black' : 'text-gray-400'
            }`}
          >
            {currentUser ? 'My Saved Events' : 'Saved Events'}
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
                : !currentUser
                ? 'Browse upcoming shows and check what vendors are bringing.'
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

        {!currentUser && activeTab === 'explore' && !loadingEvents && events.length > 0 && (
          <div className="mb-4 rounded-2xl border border-blue-900/50 bg-blue-950/15 p-3">
            <p className="text-sm font-semibold text-blue-200">
              Tip: tap More Info on a show, then use Search This Show to see matching vendor inventory and booth numbers.
            </p>
          </div>
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
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-[calc(100dvh-1.5rem)] max-h-[900px] w-full max-w-[430px] flex-col overflow-hidden rounded-3xl border border-[#222] bg-[#111] shadow-2xl sm:h-[calc(100dvh-2.5rem)]">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pb-10">
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

                {currentUser && showHuntVisible && (
                  <div
                    ref={huntSectionRef}
                    className="mb-5 scroll-mt-4 rounded-2xl border border-yellow-900/60 bg-yellow-950/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-yellow-300">
                          My Hunt
                        </p>
                        <h3 className="mt-1 text-xl font-black text-white">
                          Your cards at this show
                        </h3>
                      </div>

                      {showHuntItems.length > 0 && (
                        <span className="rounded-full bg-yellow-300 px-2.5 py-1 text-xs font-black text-black">
                          {showHuntItems.length}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-xs leading-5 text-gray-400">
                      Your active wishlist matches, ordered by booth. Mark cards as Bought or Skip them as you work through the show.
                    </p>

                    {showHuntItems.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-xl border border-[#2a2a2a] bg-black p-2 text-center">
                          <p className="text-base font-black text-white">
                            {huntStatusCounts.hunting}
                          </p>
                          <p className="text-[10px] uppercase tracking-wide text-gray-600">
                            Hunting
                          </p>
                        </div>
                        <div className="rounded-xl border border-green-900/60 bg-green-950/15 p-2 text-center">
                          <p className="text-base font-black text-green-300">
                            {huntStatusCounts.bought}
                          </p>
                          <p className="text-[10px] uppercase tracking-wide text-gray-600">
                            Bought
                          </p>
                        </div>
                        <div className="rounded-xl border border-[#2a2a2a] bg-[#151515] p-2 text-center">
                          <p className="text-base font-black text-gray-300">
                            {huntStatusCounts.skipped}
                          </p>
                          <p className="text-[10px] uppercase tracking-wide text-gray-600">
                            Skipped
                          </p>
                        </div>
                      </div>
                    )}

                    {loadingShowHunt ? (
                      <p className="mt-4 text-sm text-gray-500">
                        Building your show hunt...
                      </p>
                    ) : showHuntItems.length === 0 ? (
                      <div className="mt-4 rounded-xl border border-[#2a2a2a] bg-black p-4 text-center">
                        <CheckCircle2 className="mx-auto text-gray-600" size={28} />
                        <p className="mt-2 text-sm font-bold text-white">
                          No active matches right now
                        </p>
                        <p className="mt-1 text-xs leading-5 text-gray-500">
                          You can still search all public vendor inventory below.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {(showAllHuntItems
                          ? showHuntItems
                          : showHuntItems.slice(0, 3)
                        ).map((match) => {
                          const item = match.item
                          const price = getItemPrice(item)
                          const huntStatus =
                            huntStatuses[match.inventory_item_id || match.id] || match.status || 'hunting'
                          const updatingStatus =
                            updatingHuntStatusId === (match.inventory_item_id || match.id)

                          return (
                            <div
                              key={match.id}
                              className={`w-full rounded-xl border p-3 text-left ${
                                huntStatus === 'bought'
                                  ? 'border-green-900/70 bg-green-950/10'
                                  : huntStatus === 'skipped'
                                  ? 'border-[#2a2a2a] bg-[#121212] opacity-70'
                                  : 'border-[#2a2a2a] bg-black'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  openSearchResultBooth({
                                    id: match.id,
                                    item,
                                    vendorId: match.vendor_id,
                                    vendorName: match.vendorName,
                                    boothNumber: match.boothNumber,
                                  })
                                }
                                className="w-full text-left"
                              >
                              <div className="flex gap-3">
                                {item?.image_url ? (
                                  <img
                                    src={item.image_url}
                                    alt={getItemName(item)}
                                    className="h-20 w-14 shrink-0 rounded-lg object-contain"
                                  />
                                ) : (
                                  <div className="h-20 w-14 shrink-0 rounded-lg bg-[#1a1a1a]" />
                                )}

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate font-bold text-white">
                                        {getItemName(item)}
                                      </p>
                                      <p className="mt-1 truncate text-xs text-gray-500">
                                        {item?.set_name || 'Unknown set'}
                                        {item?.card_number ? ` #${item.card_number}` : ''}
                                      </p>
                                    </div>

                                    {price !== null && (
                                      <p className="shrink-0 font-black text-yellow-300">
                                        ${price.toFixed(2)}
                                      </p>
                                    )}
                                  </div>

                                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#222] pt-2">
                                    <p className="text-xs text-gray-400">
                                      {match.vendorName}
                                    </p>
                                    <p className="text-sm font-black text-green-300">
                                      {match.boothNumber
                                        ? `Booth ${match.boothNumber}`
                                        : 'Booth TBD'}
                                    </p>
                                  </div>

                                  {!match.listingAvailable && (
                                    <div className="mt-2 rounded-lg border border-orange-900/60 bg-orange-950/20 px-3 py-2 text-xs font-semibold text-orange-300">
                                      Listing unavailable
                                      {match.unavailableReason
                                        ? ` · ${match.unavailableReason}`
                                        : ''}
                                    </div>
                                  )}
                                </div>
                              </div>
                              </button>

                              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#222] pt-3">
                                <button
                                  type="button"
                                  disabled={updatingStatus}
                                  onClick={() => updateHuntStatus(match, 'bought')}
                                  className={`rounded-lg px-3 py-2 text-xs font-black transition disabled:opacity-50 ${
                                    huntStatus === 'bought'
                                      ? 'bg-green-300 text-black'
                                      : 'border border-green-900/70 bg-green-950/20 text-green-300'
                                  }`}
                                >
                                  {huntStatus === 'bought'
                                    ? '✓ Bought'
                                    : 'Bought'}
                                </button>

                                <button
                                  type="button"
                                  disabled={updatingStatus}
                                  onClick={() => updateHuntStatus(match, 'skipped')}
                                  className={`rounded-lg px-3 py-2 text-xs font-black transition disabled:opacity-50 ${
                                    huntStatus === 'skipped'
                                      ? 'bg-gray-300 text-black'
                                      : 'border border-[#333] bg-[#171717] text-gray-300'
                                  }`}
                                >
                                  {huntStatus === 'skipped'
                                    ? 'Skipped'
                                    : 'Skip'}
                                </button>
                              </div>
                            </div>
                          )
                        })}

                        {showHuntItems.length > 3 && (
                          <button
                            type="button"
                            onClick={() =>
                              setShowAllHuntItems((current) => !current)
                            }
                            className="w-full rounded-xl border border-[#2a2a2a] bg-[#111] p-3 text-sm font-bold text-gray-300 transition hover:border-[#444] hover:text-white"
                          >
                            {showAllHuntItems
                              ? 'Show Less'
                              : `Show ${showHuntItems.length - 3} More ${
                                  showHuntItems.length - 3 === 1
                                    ? 'Card'
                                    : 'Cards'
                                }`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div
                  ref={searchSectionRef}
                  className="mb-5 scroll-mt-4 rounded-2xl border border-[#222] bg-black p-4"
                >
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
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <select
                        value={showInventoryType}
                        onChange={(e) => setShowInventoryType(e.target.value)}
                        className="rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-white outline-none"
                      >
                        <option value="all">All Types</option>
                        <option value="raw">Raw Only</option>
                        <option value="graded">Slab Only</option>
                      </select>

                      <select
                        value={showInventorySort}
                        onChange={(e) => setShowInventorySort(e.target.value)}
                        className="rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-white outline-none"
                      >
                        <option value="price-low">Price: Low–High</option>
                        <option value="price-high">Price: High–Low</option>
                        <option value="name-asc">Name: A–Z</option>
                        <option value="name-desc">Name: Z–A</option>
                      </select>
                    </div>
                  )}

                  {visibleShowInventoryResults.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {visibleShowInventoryResults.map((result) => {
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
                                <div className="mt-2 flex items-center gap-2">
                                  {result.profileImageUrl ? (
                                    <img
                                      src={result.profileImageUrl}
                                      alt={result.vendorName}
                                      className="h-6 w-6 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[#333] bg-black">
                                      <User size={11} className="text-gray-500" />
                                    </div>
                                  )}
                                  <p className="text-xs text-green-300">
                                    Booth {result.boothNumber} · {result.vendorName}
                                  </p>
                                </div>
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

                  {showInventoryResults.length > 0 &&
                    visibleShowInventoryResults.length === 0 && (
                      <div className="mt-3 rounded-xl border border-[#222] bg-[#111] p-3 text-center">
                        <p className="text-sm text-gray-500">
                          No results match the selected type filter.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowInventoryType('all')}
                          className="mt-2 text-sm font-semibold text-yellow-300"
                        >
                          Show All Types
                        </button>
                      </div>
                    )}
                </div>


                {selectedEvent.floorplan_url && (
                  <div
                    ref={floorplanSectionRef}
                    className="mb-5 scroll-mt-4 rounded-2xl border border-[#222] bg-black p-4"
                  >
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
                              const vendorInfo = occupiedBooths.find(
                                (item) => item.boothNumber === boothCode
                              )
                              const hasVendor = Boolean(vendorInfo)

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
                                  {hasVendor && vendorInfo?.profileImageUrl ? (
                                    <img
                                      src={vendorInfo.profileImageUrl}
                                      alt={vendorInfo.vendorName}
                                      className="mx-auto h-10 w-10 rounded-full border border-green-800/70 object-cover"
                                    />
                                  ) : hasVendor ? (
                                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-green-900 bg-green-950/40">
                                      <User size={17} />
                                    </div>
                                  ) : null}

                                  <p className={`${hasVendor ? 'mt-2' : ''} text-lg font-bold`}>
                                    {boothCode}
                                  </p>
                                  <p className="mt-1 truncate text-xs">
                                    {hasVendor ? vendorInfo.vendorName : 'Empty'}
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
                  <div className="flex items-center gap-3">
                    {selectedVendorTable.profileImageUrl ? (
                      <img
                        src={selectedVendorTable.profileImageUrl}
                        alt={selectedVendorTable.vendorName}
                        className="h-14 w-14 shrink-0 rounded-full border border-[#333] object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#333] bg-[#111]">
                        <User size={22} className="text-gray-500" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="text-sm text-gray-400">
                        Booth {selectedVendorTable.boothNumber || selectedVendorTable.tableNumber}
                      </p>
                      <h2 className="mt-1 truncate text-2xl font-bold">
                        {selectedVendorTable.vendorName}
                      </h2>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">Assigned Show Inventory</h3>
                    {!selectedVendorTable.loading && (
                      <p className="shrink-0 text-xs text-gray-500">
                        {visibleVendorInventory.length} of{' '}
                        {selectedVendorTable.inventory.length} cards
                      </p>
                    )}
                  </div>

                  {!selectedVendorTable.loading &&
                    !selectedVendorTable.inventoryError &&
                    selectedVendorTable.inventory.length > 0 && (
                      <div className="mb-4 space-y-3 rounded-2xl border border-[#222] bg-black p-3">
                        <div className="flex items-center rounded-xl border border-[#222] bg-[#111] px-3">
                          <SearchIcon size={17} className="text-gray-500" />
                          <input
                            placeholder="Search this vendor's inventory"
                            value={vendorInventorySearch}
                            onChange={(e) => setVendorInventorySearch(e.target.value)}
                            className="w-full bg-transparent p-3 text-sm text-white outline-none"
                          />

                          {vendorInventorySearch && (
                            <button
                              type="button"
                              onClick={() => setVendorInventorySearch('')}
                              className="text-gray-500 hover:text-white"
                              aria-label="Clear vendor inventory search"
                            >
                              <X size={17} />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={vendorInventoryType}
                            onChange={(e) => setVendorInventoryType(e.target.value)}
                            className="rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-white outline-none"
                          >
                            <option value="all">All Types</option>
                            <option value="raw">Raw Only</option>
                            <option value="graded">Slab Only</option>
                          </select>

                          <select
                            value={vendorInventorySort}
                            onChange={(e) => setVendorInventorySort(e.target.value)}
                            className="rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-white outline-none"
                          >
                            <option value="name-asc">Name: A–Z</option>
                            <option value="name-desc">Name: Z–A</option>
                            <option value="price-low">Price: Low–High</option>
                            <option value="price-high">Price: High–Low</option>
                          </select>
                        </div>
                      </div>
                    )}

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
                  ) : visibleVendorInventory.length === 0 ? (
                    <div className="rounded-2xl border border-[#222] bg-black p-5 text-center">
                      <p className="text-sm font-semibold text-white">
                        No inventory matches your filters.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setVendorInventorySearch('')
                          setVendorInventoryType('all')
                          setVendorInventorySort('name-asc')
                        }}
                        className="mt-3 rounded-xl border border-[#222] bg-[#111] px-4 py-2 text-sm font-semibold text-gray-300"
                      >
                        Clear Filters
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {visibleVendorInventory.map((item) => {
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
        </div>
      )}

      {showGuestPrompt && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-5">
          <div className="w-full max-w-sm rounded-3xl border border-[#2a2a2a] bg-[#111] p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-yellow-300">
                  Free account
                </p>
                <h2 className="mt-2 text-2xl font-bold">Save your shows</h2>
              </div>

              <button
                type="button"
                onClick={() => setShowGuestPrompt(false)}
                className="rounded-full border border-[#2a2a2a] bg-black p-2 text-gray-400"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm leading-6 text-gray-400">
              Guests can explore shows, floorplans, vendors, and public inventory.
              Create a free Vendly account to save shows and keep them on your dashboard.
            </p>

            <button
              type="button"
              onClick={() => navigate('/?mode=signup&returnTo=/map')}
              className="mt-5 w-full rounded-xl bg-white p-4 font-bold text-black"
            >
              Create Free Account
            </button>

            <button
              type="button"
              onClick={() => setShowGuestPrompt(false)}
              className="mt-3 w-full rounded-xl border border-[#2a2a2a] bg-black p-4 text-sm font-semibold text-gray-300"
            >
              Keep Exploring
            </button>
          </div>
        </div>
      )}

      <Navbar />
    </div>
  )
}

export default Map