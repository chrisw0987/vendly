import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import CardScanner from '../components/CardScanner'

// Keeps Search state while the user navigates around the SPA.
// Because this lives only in the loaded JavaScript module, a full browser
// refresh clears it automatically.
let searchPageMemory = null

import {
  Search as SearchIcon,
  ArrowUpDown,
  SlidersHorizontal,
  Funnel,
  ChevronDown,
  Plus,
  CalendarDays,
  X,
  Flame,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Camera,
} from 'lucide-react'

function Search() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [activeSearchQuery, setActiveSearchQuery] = useState('')
  const [cards, setCards] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalResults, setTotalResults] = useState(0)
  const RESULTS_PER_PAGE = 15
  const [loading, setLoading] = useState(false)
  const [showCardScanner, setShowCardScanner] = useState(false)
  const [capturedScanImage, setCapturedScanImage] = useState('')
  const [capturedScanNumberRegion, setCapturedScanNumberRegion] = useState('')
  const [scanCandidates, setScanCandidates] = useState([])
  const [scanDetected, setScanDetected] = useState(null)
  const [scanTimings, setScanTimings] = useState(null)
  const [showScanMatches, setShowScanMatches] = useState(false)
  const [matchingScan, setMatchingScan] = useState(false)
  const [scanAlternativesLoading, setScanAlternativesLoading] = useState(false)
  const [scanAlternativesLoaded, setScanAlternativesLoaded] = useState(false)
  const [selectedFromScan, setSelectedFromScan] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [imageLoadingIds, setImageLoadingIds] = useState(() => new Set())
  const [imageUnavailableIds, setImageUnavailableIds] = useState(() => new Set())

  const [sortOption, setSortOption] = useState('')
  const [filterOption, setFilterOption] = useState('cards')
  const [cardTypeFilters, setCardTypeFilters] = useState([])
  const [rarityFilters, setRarityFilters] = useState([])
  const [setFilters, setSetFilters] = useState([])
  const [languageFilters, setLanguageFilters] = useState([])
  const [filterFacets, setFilterFacets] = useState(null)
  const [loadingFilterFacets, setLoadingFilterFacets] = useState(false)
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [showAdvancedFilterMenu, setShowAdvancedFilterMenu] = useState(false)
  const [openAdvancedDropdown, setOpenAdvancedDropdown] = useState('')

  const [inventoryCounts, setInventoryCounts] = useState({})
  const [lists, setLists] = useState([])
  const [selectedListId, setSelectedListId] = useState('')
  const [wishlistLists, setWishlistLists] = useState([])
  const [selectedWishlistListId, setSelectedWishlistListId] = useState('')

  const [selectedCard, setSelectedCard] = useState(null)
  const [showDestinationModal, setShowDestinationModal] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [addDestination, setAddDestination] = useState('wishlist')
  const [showRawModal, setShowRawModal] = useState(false)
  const [showGradedModal, setShowGradedModal] = useState(false)

  const [condition, setCondition] = useState('NM')
  const [gradeCompany, setGradeCompany] = useState('PSA')
  const [grade, setGrade] = useState('10')
  const [certNumber, setCertNumber] = useState('')
  const [scanProcessingLabel, setScanProcessingLabel] = useState('Identifying card...')

  const [quantity, setQuantity] = useState(1)
  const [physicalLocation, setPhysicalLocation] = useState('')
  const [showPublic, setShowPublic] = useState(false)
  const [listingPrice, setListingPrice] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [priority, setPriority] = useState(2)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [vendorShows, setVendorShows] = useState([])
  const [selectedShowIds, setSelectedShowIds] = useState([])
  const [accountType, setAccountType] = useState('user')
  const [currentUser, setCurrentUser] = useState(null)
  const [showGuestPrompt, setShowGuestPrompt] = useState(false)
  const [searchStateRestored, setSearchStateRestored] = useState(false)

  const [discovery, setDiscovery] = useState({
    recent_sets: [],
    top_movers: [],
    trending_sets: [],
  })
  const [loadingDiscovery, setLoadingDiscovery] = useState(false)
  const [discoveryLoaded, setDiscoveryLoaded] = useState(false)

  const isVendor = accountType === 'vendor' || accountType === 'admin'
  const isGuest = !currentUser

  useEffect(() => {
    if (searchPageMemory) {
      const saved = searchPageMemory

      if (typeof saved.search === 'string') setSearch(saved.search)
      if (typeof saved.activeSearchQuery === 'string') {
        setActiveSearchQuery(saved.activeSearchQuery)
      }
      if (Array.isArray(saved.cards)) setCards(saved.cards)
      if (Number.isInteger(saved.currentPage) && saved.currentPage > 0) {
        setCurrentPage(saved.currentPage)
      }
      if (Number.isInteger(saved.totalPages) && saved.totalPages > 0) {
        setTotalPages(saved.totalPages)
      }
      if (Number.isInteger(saved.totalResults) && saved.totalResults >= 0) {
        setTotalResults(saved.totalResults)
      }
      if (typeof saved.sortOption === 'string') setSortOption(saved.sortOption)
      if (saved.filterOption === 'cards' || saved.filterOption === 'sealed') {
        setFilterOption(saved.filterOption)
      }
      if (Array.isArray(saved.cardTypeFilters)) {
        setCardTypeFilters(saved.cardTypeFilters)
      }
      if (Array.isArray(saved.rarityFilters)) {
        setRarityFilters(saved.rarityFilters)
      }
      if (Array.isArray(saved.setFilters)) {
        setSetFilters(saved.setFilters)
      }
      if (Array.isArray(saved.languageFilters)) {
        setLanguageFilters(saved.languageFilters)
      }
      if (saved.filterFacets && typeof saved.filterFacets === 'object') {
        setFilterFacets(saved.filterFacets)
      }
    }

    setSearchStateRestored(true)

    fetchAccountType()
    fetchInventoryCounts()
    fetchInventoryLists()
    fetchWishlistLists()
    fetchVendorShows()
    loadDiscovery()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setCurrentUser(session?.user || null)

      if (event === 'SIGNED_OUT') {
        searchPageMemory = null
        setAccountType('user')
      }
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!searchStateRestored) return

    searchPageMemory = {
      search,
      activeSearchQuery,
      cards,
      currentPage,
      totalPages,
      totalResults,
      sortOption,
      filterOption,
      cardTypeFilters,
      rarityFilters,
      setFilters,
      languageFilters,
      filterFacets,
    }
  }, [
    searchStateRestored,
    search,
    activeSearchQuery,
    cards,
    currentPage,
    totalPages,
    totalResults,
    sortOption,
    filterOption,
    cardTypeFilters,
    rarityFilters,
    setFilters,
    languageFilters,
    filterFacets,
  ])


  function getCardId(card) {
    return (
      card?.pokewallet_id ||
      card?.card_id ||
      card?.tcgplayer_id ||
      card?.uuid ||
      card?.id ||
      getCardName(card)
    )
  }

  function getCardName(card) {
    return card?.card_info?.name || card?.name || card?.cardName || 'Unknown Card'
  }

  function getSetName(card) {
    return (
      card?.card_info?.set_name ||
      card?.set?.name ||
      card?.set_name ||
      card?.setName ||
      'Set N/A'
    )
  }

  function getCardNumber(card) {
    return (
      card?.card_info?.card_number ||
      card?.card_info?.number ||
      card?.number ||
      card?.card_number ||
      'N/A'
    )
  }

  function getRarity(card) {
    return card?.card_info?.rarity || card?.rarity || 'Rarity N/A'
  }

  function normalizeRarity(rarity) {
    const value = String(rarity || '').trim().toLowerCase()

    const aliases = {
      ir: 'Illustration Rare',
      'illustration rare': 'Illustration Rare',
      sir: 'Special Illustration Rare',
      'special illustration rare': 'Special Illustration Rare',
      'double rare': 'Double Rare',
      'ultra rare': 'Ultra Rare',
      'hyper rare': 'Hyper Rare',
      'ace spec rare': 'ACE SPEC Rare',
      'ace spec': 'ACE SPEC Rare',
      rare: 'Rare',
      uncommon: 'Uncommon',
      common: 'Common',
      promo: 'Promo',
      'code card': 'Code Card',
    }

    return aliases[value] || String(rarity || '').trim()
  }

  function getCardType(card) {
    const raw =
      card?.card_info?.supertype ||
      card?.card_info?.card_type ||
      card?.supertype ||
      card?.card_type ||
      card?.type ||
      ''

    const value = String(raw || '').trim().toLowerCase()

    if (!value) return 'Unknown'
    if (value.includes('pokémon') || value.includes('pokemon')) return 'Pokémon'
    if (value.includes('supporter')) return 'Supporter'
    if (value.includes('stadium')) return 'Stadium'
    if (value.includes('tool')) return 'Tool'
    if (value.includes('energy')) return 'Energy'
    if (value.includes('item')) return 'Item'
    if (value.includes('trainer')) return 'Trainer'

    return String(raw).trim()
  }

  function getCardLanguages(card) {
    const rawLanguages = Array.isArray(card?.image_languages)
      ? card.image_languages
      : Array.isArray(card?.images?.languages)
      ? card.images.languages
      : []

    const directLanguage =
      card?.set_language ||
      card?.language ||
      card?.card_info?.language ||
      card?.set?.language ||
      null

    const values = directLanguage
      ? [...rawLanguages, directLanguage]
      : rawLanguages

    const aliases = {
      en: 'English',
      eng: 'English',
      english: 'English',
      ja: 'Japanese',
      jp: 'Japanese',
      jap: 'Japanese',
      jpn: 'Japanese',
      japanese: 'Japanese',
      de: 'German',
      ger: 'German',
      deu: 'German',
      german: 'German',
      fr: 'French',
      fre: 'French',
      fra: 'French',
      french: 'French',
      es: 'Spanish',
      spa: 'Spanish',
      spanish: 'Spanish',
      it: 'Italian',
      ita: 'Italian',
      italian: 'Italian',
      pt: 'Portuguese',
      por: 'Portuguese',
      portuguese: 'Portuguese',
      zh: 'Chinese',
      chn: 'Chinese',
      zho: 'Chinese',
      chinese: 'Chinese',
      ko: 'Korean',
      kor: 'Korean',
      korean: 'Korean',
    }

    const normalizedSetLanguage = directLanguage
      ? aliases[String(directLanguage).trim().toLowerCase()] ||
        String(directLanguage).trim().toUpperCase()
      : ''

    const normalized = values
      .map((value) => {
        const key = String(value || '').trim().toLowerCase()

        if (
          key === 'en' &&
          normalizedSetLanguage &&
          normalizedSetLanguage !== 'English'
        ) {
          return ''
        }

        return aliases[key] || (key ? key.toUpperCase() : '')
      })
      .filter(Boolean)

    if (normalizedSetLanguage) {
      normalized.unshift(normalizedSetLanguage)
    }

    return [...new Set(normalized)]
  }

  function toggleFilterValue(setter, value) {
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    )
  }

  function getFilterOptionCounts(values) {
    const counts = {}

    values.forEach((value) => {
      if (!value || value === 'Unknown') return
      counts[value] = (counts[value] || 0) + 1
    })

    return Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0])
    })
  }

  function getCardImage(card) {
    if (card?.image_url) return card.image_url
    if (card?.image) return card.image
    if (card?.images?.large) return card.images.large
    if (card?.images?.small) return card.images.small

    return null
  }

  function setImageLoading(cardId, isLoading) {
    if (!cardId) return

    setImageLoadingIds((current) => {
      const next = new Set(current)

      if (isLoading) next.add(cardId)
      else next.delete(cardId)

      return next
    })
  }

  function setImageUnavailable(cardId, isUnavailable = true) {
    if (!cardId) return

    setImageUnavailableIds((current) => {
      const next = new Set(current)

      if (isUnavailable) next.add(cardId)
      else next.delete(cardId)

      return next
    })
  }

  function CardImagePlaceholder({ unavailable = false }) {
    if (unavailable) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl bg-[#171717] px-2 text-center">
          <img
            src="/vendly-logo.svg"
            alt="Vendly"
            className="max-h-10 max-w-[70%] object-contain opacity-80"
          />
          <p className="text-[10px] font-medium leading-tight text-gray-500">
            Image Coming Soon
          </p>
        </div>
      )
    }

    return (
      <div className="h-full w-full animate-pulse rounded-xl bg-[#1a1a1a]" />
    )
  }

  function getMarketPrice(card) {
    const directPrice =
      card?.market_price ||
      card?.price ||
      card?.prices?.market ||
      card?.prices?.usd
    
    if (directPrice) return directPrice
    
    const tcgPrices = card?.tcgplayer?.prices || []
    const cardmarketPrices = card?.cardmarket?.prices || []

    const tcgMarket =
      tcgPrices.find((price) => price.market_price)?.market_price ||
      tcgPrices.find((price) => price.mid_price)?.mid_price ||
      tcgPrices.find((price) => price.low_price)?.low_price

    const cardmarketMarket =
      cardmarketPrices.find((price) => price.avg)?.avg ||
      cardmarketPrices.find((price) => price.trend)?.trend ||
      cardmarketPrices.find((price) => price.avg30)?.avg30 ||
      cardmarketPrices.find((price) => price.low)?.low

    return tcgMarket || cardmarketMarket || null
  }

  function getMarketPriceContext(card) {
    const price = getMarketPrice(card)
    if (price == null) return null

    const currency = String(card?.currency || 'USD').toUpperCase()
    const source = String(card?.price_source || '').toLowerCase()

    return {
      price: Number(price),
      currency,
      source,
      formatted:
        currency === 'EUR'
          ? `€${Number(price).toFixed(2)}`
          : `$${Number(price).toFixed(2)}`,
      label:
        source === 'cardmarket'
          ? 'CardMarket'
          : source === 'tcgplayer'
          ? 'TCGPlayer market'
          : 'market',
    }
  }

  function getConditionMultiplier(condition) {
    switch (condition) {
      case 'NM':
        return 1
      case 'LP':
        return 0.85
      case 'MP':
        return 0.65
      case 'HP':
        return 0.45
      case 'DMG':
        return 0.25
      default:
        return 1
    }
  }

  function getSuggestedPrice(card, itemType, condition) {
    const marketPrice = getMarketPrice(card)

    if (!marketPrice) return null

    if (itemType === 'raw') {
      return Number(marketPrice) * getConditionMultiplier(condition)
    }

    return Number(marketPrice)
  }

  async function fetchAccountType() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUser(user || null)

    if (!user) {
      setAccountType('user')
      return
    }

    const { data, error } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .maybeSingle()

    if (!error) {
      setAccountType(data?.account_type || 'user')
    }
  }

  async function fetchInventoryLists() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase
      .from('inventory_lists')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })

    if (error || !data) return

    setLists(data)

    if (data.length > 0) {
      setSelectedListId(data[0].id)
    }
  }


  async function fetchWishlistLists() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase
      .from('wishlist_lists')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(error.message)
      return
    }

    const availableLists = data || []
    setWishlistLists(availableLists)

    if (availableLists.length > 0) {
      setSelectedWishlistListId(availableLists[0].id)
    }
  }

  async function fetchVendorShows() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data: profileData } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .maybeSingle()

    const userIsVendor =
      profileData?.account_type === 'vendor' || profileData?.account_type === 'admin'

    if (!userIsVendor) {
      setVendorShows([])
      return
    }

    const { data, error } = await supabase
      .from('vendor_event_profiles')
      .select(`
        id,
        event_id,
        booth_number,
        display_name,
        public_enabled,
        events (
          id,
          name,
          city,
          state,
          venue,
          starts_at
        )
      `)
      .eq('vendor_id', user.id)

    if (error) {
      setMessage(error.message)
      return
    }

    const shows =
      data
        ?.map((profile) => ({
          ...profile.events,
          vendor_event_profile_id: profile.id,
          booth_number: profile.booth_number,
          display_name: profile.display_name,
          public_enabled: profile.public_enabled,
        }))
        .filter(Boolean)
        .sort(
          (a, b) =>
            new Date(a.starts_at || 0).getTime() -
            new Date(b.starts_at || 0).getTime()
        ) || []

    setVendorShows(shows)
  }

  function toggleSelectedShow(eventId) {
    setSelectedShowIds((current) =>
      current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId]
    )
  }

  function formatEventDate(date) {
    if (!date) return 'Date TBD'

    return new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  async function loadDiscovery() {
    if (loadingDiscovery || discoveryLoaded) return

    setLoadingDiscovery(true)

    const { data, error } = await supabase.functions.invoke('pokewallet-search', {
      body: {
        mode: 'discover',
      },
    })

    if (error) {
      console.warn('Unable to load Search discovery:', error)
      setLoadingDiscovery(false)
      setDiscoveryLoaded(true)
      return
    }

    const nextDiscovery = {
      recent_sets: Array.isArray(data?.recent_sets) ? data.recent_sets : [],
      top_movers: Array.isArray(data?.top_movers) ? data.top_movers : [],
      trending_sets: Array.isArray(data?.trending_sets) ? data.trending_sets : [],
    }

    setDiscovery(nextDiscovery)
    setLoadingDiscovery(false)
    setDiscoveryLoaded(true)

    cacheDiscoveryCardImages(nextDiscovery.top_movers)
  }

  async function cacheDiscoveryCardImages(items) {
    const updates = await Promise.all(
      items.map(async (card) => {
        const cardId = getCardId(card)
        if (!cardId) return card

        const { data, error } = await supabase.functions.invoke(
          'pokewallet-cache-image',
          {
            body: { id: cardId },
          }
        )

        if (error || !data?.image_url) return card

        return {
          ...card,
          image_url: data.image_url,
        }
      })
    )

    setDiscovery((current) => ({
      ...current,
      top_movers: updates,
    }))
  }

  function runDiscoverySearch({ displayQuery, searchQuery }) {
    const visibleQuery = String(displayQuery || searchQuery || '').trim()
    const backendQuery = String(searchQuery || displayQuery || '').trim()

    if (!backendQuery) return

    setSearch(visibleQuery)
    setActiveSearchQuery(backendQuery)
    setCurrentPage(1)

    searchCards(1, backendQuery, {
      displayQuery: visibleQuery,
      updateActiveQuery: false,
    })
  }

  function openDiscoverySet(set) {
    const displayQuery =
      set?.display_name ||
      set?.set_name ||
      set?.name ||
      set?.raw_set_name ||
      set?.set_code ||
      ''

    const searchQuery =
      set?.set_id ||
      set?.set_code ||
      set?.raw_set_name ||
      set?.set_name ||
      set?.display_name ||
      set?.name ||
      ''

    runDiscoverySearch({
      displayQuery,
      searchQuery,
    })
  }

  function formatSetReleaseDate(value) {
    if (!value) return 'Release date unavailable'

    const cleaned = String(value).replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    const date = new Date(cleaned)

    if (Number.isNaN(date.getTime())) return String(value)

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  async function loadGlobalFilterFacets(queryOverride = search) {
    const cleanQuery = String(queryOverride || '').trim()

    if (!cleanQuery || loadingFilterFacets || filterOption !== 'cards') return

    setLoadingFilterFacets(true)

    const { data, error } = await supabase.functions.invoke('pokewallet-search', {
      body: {
        query: cleanQuery,
        page: 1,
        limit: RESULTS_PER_PAGE,
        facets_only: true,
      },
    })

    if (error) {
      console.warn('Unable to load global filter options:', error)
      setLoadingFilterFacets(false)
      return
    }

    setFilterFacets(data?.facets || null)
    setLoadingFilterFacets(false)
  }

  async function searchCards(
    page = 1,
    queryOverride = activeSearchQuery || search,
    options = {}
  ) {
    if (loading) return

    const cleanQuery = String(queryOverride || '').trim()
    const displayQuery = String(options?.displayQuery ?? search ?? cleanQuery).trim()
    const shouldUpdateActiveQuery = options?.updateActiveQuery !== false
    const safePage = Number.isInteger(page) && page > 0 ? page : 1
    const filtersToUse = options?.filtersOverride || {
      cardTypes: cardTypeFilters,
      rarities: rarityFilters,
      sets: setFilters,
      languages: languageFilters,
    }

    if (displayQuery && displayQuery !== search) {
      setSearch(displayQuery)
    }

    if (shouldUpdateActiveQuery && cleanQuery) {
      setActiveSearchQuery(cleanQuery)
    }

    if (!cleanQuery) {
      setCards([])
      setTotalResults(0)
      setMessage('Enter a card name before searching.')
      return
    }

    if (filterOption === 'sealed') {
      setCards([])
      setTotalResults(0)
      setMessage('Sealed product search will be added later.')
      return
    }

    setLoading(true)
    setMessage('')

    const { data, error } = await supabase.functions.invoke('pokewallet-search', {
      body: {
        query: cleanQuery,
        page: safePage,
        limit: RESULTS_PER_PAGE,
        filters: filtersToUse,
      },
    })

    console.log('Search data:', data)
    console.log('Search error:', error)

    if (error) {
      console.error('Search request failed:', error)
      console.error('Search response data:', data)
      setMessage('An error has occurred. Please try again.')
      setCards([])
      setTotalResults(0)
      setLoading(false)
      return
    }

    const results = data?.results || data?.data || data?.cards || []

    setFilterFacets(data?.facets || null)
    setCards(results)
    setCurrentPage(safePage)
    setTotalPages(data?.pagination?.total_pages || data?.total_pages || 1)
    setTotalResults(
      Number(
        data?.pagination?.total_results ??
          data?.pagination?.total ??
          results.length
      ) || 0
    )

    if (safePage > 1) {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }

    if (results.length === 0) {
      setMessage('No results found.')
    }

    setLoading(false)

    if (results.length > 0) {
      cacheSearchResultImages(results, getSelectedLocalizedImageCode())
    }
  }

  async function fetchInventoryCounts() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase
      .from('inventory_items')
      .select('card_id, quantity')
      .eq('owner_id', user.id)

    if (error || !data) return

    const counts = {}

    data.forEach((item) => {
      counts[item.card_id] =
        (counts[item.card_id] || 0) + Number(item.quantity || 0)
    })

    setInventoryCounts(counts)
  }

  function openAddTypeModal(
    card,
    preferredDestination = null,
    fromScan = false
  ) {
    if (isGuest) {
      setSelectedCard(card)
      setSelectedFromScan(fromScan)
      setShowGuestPrompt(true)
      return
    }

    const destination =
      preferredDestination || (isVendor ? '' : 'wishlist')

    setSelectedCard(card)
    setSelectedFromScan(fromScan)
    setListingPrice('')
    setPurchasePrice('')
    setTargetPrice('')
    setPriority(2)
    setNotificationsEnabled(true)
    setAddDestination(destination)
    setCondition(destination === 'wishlist' ? 'ANY' : 'NM')
    setGradeCompany('PSA')
    setGrade('10')
    setCertNumber('')
    setQuantity(1)
    setPhysicalLocation('')
    setShowPublic(false)
    setSelectedShowIds([])

    if (isVendor && !preferredDestination) {
      setShowDestinationModal(true)
    } else {
      setShowTypeModal(true)
    }
  }

  function chooseAddDestination(destination) {
    setAddDestination(destination)
    setCondition(destination === 'wishlist' ? 'ANY' : 'NM')
    setShowDestinationModal(false)
    setShowTypeModal(true)
  }

  const addingToInventory = isVendor && addDestination === 'inventory'

  function getSelectedLocalizedImageCode() {
    if (languageFilters.length !== 1) return ''

    const languageToCode = {
      Italian: 'it',
      French: 'fr',
      German: 'de',
      Spanish: 'es',
      Portuguese: 'pt',
    }

    return languageToCode[languageFilters[0]] || ''
  }

  async function cacheSelectedCardImage(card) {
    const cardId =
      card?.pokewallet_id ||
      card?.card_id ||
      card?.tcgplayer_id ||
      card?.uuid ||
      card?.id ||
      getCardId(card)

    if (!cardId) return getCardImage(card)

    const { data, error } = await supabase.functions.invoke(
      'pokewallet-cache-image',
      {
        body: { id: cardId },
      }
    )

    if (error) {
      console.warn('Image cache failed:', error.message)
      return getCardImage(card)
    }

    return data?.image_url || getCardImage(card)
  }

  async function cacheSearchResultImages(
    results,
    localizedLanguage = getSelectedLocalizedImageCode()
  ) {
    results.forEach(async (card) => {
      const cardId = getCardId(card)
      if (!cardId) return

      if (getCardImage(card)) {
        setImageLoading(cardId, false)
        setImageUnavailable(cardId, false)
        return
      }

      setImageLoading(cardId, true)
      setImageUnavailable(cardId, false)

      if (localizedLanguage) {
        const availableCodes = Array.isArray(card?.image_languages)
          ? card.image_languages.map((value) =>
              String(value || '').trim().toLowerCase()
            )
          : []

        if (!availableCodes.includes(localizedLanguage)) {
          setImageLoading(cardId, false)
          setImageUnavailable(cardId, true)
          return
        }

        const { data, error } = await supabase.functions.invoke(
          'pokewallet-localized-image',
          {
            body: {
              id: cardId,
              lang: localizedLanguage,
              size: 'high',
            },
          }
        )

        if (error) {
          console.warn('Localized image cache failed:', error.message)
          setImageLoading(cardId, false)
          return
        }

        if (!data?.localized || !data?.image_url) {
          setImageLoading(cardId, false)
          setImageUnavailable(cardId, true)
          return
        }

        setCards((currentCards) =>
          currentCards.map((currentCard) =>
            getCardId(currentCard) === cardId
              ? {
                  ...currentCard,
                  image_url: data.image_url,
                  displayed_image_language: data.served_language,
                }
              : currentCard
          )
        )

        setScanCandidates((currentCards) =>
          currentCards.map((currentCard) =>
            getCardId(currentCard) === cardId
              ? {
                  ...currentCard,
                  image_url: data.image_url,
                  displayed_image_language: data.served_language,
                }
              : currentCard
          )
        )

        setSelectedCard((currentCard) =>
          currentCard && getCardId(currentCard) === cardId
            ? {
                ...currentCard,
                image_url: data.image_url,
                displayed_image_language: data.served_language,
              }
            : currentCard
        )

        setImageLoading(cardId, false)
        setImageUnavailable(cardId, false)
        return
      }

      const { data, error } = await supabase.functions.invoke(
        'pokewallet-cache-image',
        {
          body: { id: cardId },
        }
      )

      if (error) {
        console.warn('Background image cache failed:', error.message)
        setImageLoading(cardId, false)
        return
      }

      if (!data?.image_url) {
        setImageLoading(cardId, false)
        setImageUnavailable(cardId, true)
        return
      }

      setCards((currentCards) =>
        currentCards.map((currentCard) =>
          getCardId(currentCard) === cardId
            ? {
                ...currentCard,
                image_url: data.image_url,
              }
            : currentCard
        )
      )

      setScanCandidates((currentCards) =>
        currentCards.map((currentCard) =>
          getCardId(currentCard) === cardId
            ? {
                ...currentCard,
                image_url: data.image_url,
              }
            : currentCard
        )
      )

      setSelectedCard((currentCard) =>
        currentCard && getCardId(currentCard) === cardId
          ? {
              ...currentCard,
              image_url: data.image_url,
            }
          : currentCard
      )

      setImageLoading(cardId, false)
      setImageUnavailable(cardId, false)
    })
  }

  async function addToWishlist(itemType) {
    if (!selectedCard || saving) return

    setSaving(true)
    setMessage('')

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setMessage('You must be logged in to add to your wishlist.')
        return
      }

      if (!selectedWishlistListId) {
        setMessage('Please create or select a wishlist first.')
        return
      }

      setMessage('Caching card image...')
      const cachedImageUrl = await cacheSelectedCardImage(selectedCard)

      const newWishlistItem = {
        owner_id: user.id,
        wishlist_list_id: selectedWishlistListId,
        card_id: getCardId(selectedCard),
        card_name: getCardName(selectedCard),
        set_name: getSetName(selectedCard),
        card_number: getCardNumber(selectedCard),
        rarity: getRarity(selectedCard),
        image_url: cachedImageUrl,
        item_type: itemType,
        desired_condition: itemType === 'raw' ? condition : null,
        grade_company: itemType === 'graded' ? gradeCompany : null,
        desired_grade: itemType === 'graded' ? grade : null,
        target_price: targetPrice === '' ? null : Number(targetPrice),
        desired_quantity: 1,
        priority: Number(priority),
        notes: null,
        notifications_enabled: notificationsEnabled,
      }

      setMessage('Adding to wishlist...')

      const { error } = await supabase
        .from('wishlist_items')
        .insert(newWishlistItem)

      if (error) {
        if (error.code === '23505') {
          setMessage('This card is already in that wishlist with the same preferences.')
          return
        }

        setMessage(error.message)
        return
      }

      setShowRawModal(false)
      setShowGradedModal(false)
      setSelectedCard(null)
      setMessage('Added to wishlist.')
    } finally {
      setSaving(false)
    }
  }

  async function addToInventory(itemType) {
    if (!selectedCard || saving) return

    setSaving(true)
    setMessage('')

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setMessage('You must be logged in to add inventory.')
        return
      }

      if (!selectedListId) {
        setMessage('Please create or select an inventory list first.')
        return
      }

      const marketPrice = getMarketPrice(selectedCard)
      const suggestedPrice = getSuggestedPrice(selectedCard, itemType, condition)

      const finalListingPrice = isVendor
        ? listingPrice === ''
          ? suggestedPrice
          : Number(listingPrice)
        : null

      setMessage('Caching card image...')
      const cachedImageUrl = await cacheSelectedCardImage(selectedCard)

      const newItem = {
        owner_id: user.id,
        inventory_list_id: selectedListId,

        card_id: getCardId(selectedCard),
        card_name: getCardName(selectedCard),
        set_name: getSetName(selectedCard),
        card_number: getCardNumber(selectedCard),
        rarity: getRarity(selectedCard),
        image_url: cachedImageUrl,

        market_price: marketPrice,
        listing_price: finalListingPrice,
        purchase_price: isVendor && purchasePrice !== '' ? Number(purchasePrice) : null,

        quantity: isVendor ? Number(quantity) : 1,
        condition: itemType === 'raw' ? condition : null,

        item_type: itemType,
        grade_company: itemType === 'graded' ? gradeCompany : null,
        grade: itemType === 'graded' ? grade : null,
        cert_number:
          itemType === 'graded' && gradeCompany === 'PSA' && certNumber
            ? certNumber
            : null,

        physical_location: isVendor ? physicalLocation || null : null,
        is_public: isVendor ? showPublic : false,
        is_sold: false,
        collection_status: isVendor ? 'found' : 'hunting',
      }

      setMessage('Checking for duplicates...')

      let duplicateQuery = supabase
        .from('inventory_items')
        .select('*')
        .eq('owner_id', user.id)
        .eq('inventory_list_id', selectedListId)
        .eq('card_id', newItem.card_id)
        .eq('item_type', newItem.item_type)
        .eq('is_sold', false)
        .limit(1)

      if (itemType === 'raw') {
        duplicateQuery = duplicateQuery.eq('condition', newItem.condition)
      } else if (newItem.cert_number) {
        duplicateQuery = duplicateQuery.eq(
          'cert_number',
          newItem.cert_number
        )
      } else {
        duplicateQuery = duplicateQuery
          .eq('grade_company', newItem.grade_company)
          .eq('grade', newItem.grade)
      }

      const { data: duplicateItems, error: duplicateError } = await duplicateQuery

      if (duplicateError) {
        setMessage(duplicateError.message)
        return
      }

      const duplicateItem = duplicateItems?.[0]
      const shouldMerge = duplicateItem
        ? window.confirm(
            isVendor
              ? `You already have ${duplicateItem.card_name} in this list. Merge this quantity into the existing item?`
              : `You already have ${duplicateItem.card_name} in this list. Keep it saved in your collection?`
          )
        : false

      let inventoryItemId = duplicateItem?.id || null

      if (duplicateItem && shouldMerge) {
        setMessage('Merging into existing item...')

        const mergedQuantity = isVendor
          ? Number(duplicateItem.quantity || 0) + Number(quantity)
          : Number(duplicateItem.quantity || 1)

        const mergeUpdates = {
          quantity: mergedQuantity,
          market_price: newItem.market_price,
          listing_price: newItem.listing_price ?? duplicateItem.listing_price,
          purchase_price: newItem.purchase_price ?? duplicateItem.purchase_price,
          physical_location: newItem.physical_location || duplicateItem.physical_location,
          is_public: isVendor ? (duplicateItem.is_public || newItem.is_public) : false,
        }

        const { error: mergeError } = await supabase
          .from('inventory_items')
          .update(mergeUpdates)
          .eq('id', duplicateItem.id)

        if (mergeError) {
          setMessage(mergeError.message)
          return
        }
      } else {
        setMessage(isVendor ? 'Adding to inventory...' : 'Adding to collection...')

        const { data: insertedItem, error } = await supabase
          .from('inventory_items')
          .insert(newItem)
          .select('id')
          .single()

        if (error) {
          setMessage(error.message)
          return
        }

        inventoryItemId = insertedItem.id
      }

      if (isVendor && inventoryItemId && selectedShowIds.length > 0) {
        setMessage('Assigning to show...')

        const assignments = selectedShowIds.map((eventId) => ({
          vendor_id: user.id,
          inventory_item_id: inventoryItemId,
          event_id: eventId,
        }))

        const { error: assignmentError } = await supabase
          .from('show_inventory')
          .upsert(assignments, {
            onConflict: 'inventory_item_id,event_id',
            ignoreDuplicates: true,
          })

        if (assignmentError) {
          setMessage(assignmentError.message)
          return
        }
      }

      const cardId = getCardId(selectedCard)

      setInventoryCounts((current) => ({
        ...current,
        [cardId]: (current[cardId] || 0) + (isVendor ? Number(quantity) : 1),
      }))

      setShowRawModal(false)
      setShowGradedModal(false)
      setSelectedCard(null)
      setSelectedShowIds([])
      setMessage(
        duplicateItem && shouldMerge
          ? 'Merged into existing inventory item.'
          : selectedShowIds.length > 0
          ? 'Added to inventory and assigned to show.'
          : isVendor
          ? 'Added to inventory.'
          : 'Added to collection.'
      )
    } finally {
      setSaving(false)
    }
  }

  function facetToOptions(key, fallbackValues) {
    const serverFacet = filterFacets?.[key]

    if (Array.isArray(serverFacet)) {
      return serverFacet.map((item) => [item.value, Number(item.count || 0)])
    }

    return getFilterOptionCounts(fallbackValues)
  }

  const cardTypeOptions = useMemo(
    () =>
      facetToOptions(
        'cardTypes',
        cards.map((card) => getCardType(card))
      ),
    [cards, filterFacets]
  )

  const rarityOptions = useMemo(
    () =>
      facetToOptions(
        'rarities',
        cards.map((card) => normalizeRarity(getRarity(card)))
      ),
    [cards, filterFacets]
  )

  const setOptions = useMemo(
    () =>
      facetToOptions(
        'sets',
        cards.map((card) => getSetName(card))
      ),
    [cards, filterFacets]
  )

  const languageOptions = useMemo(
    () => {
      const serverFacet = filterFacets?.languages

      if (Array.isArray(serverFacet)) {
        return serverFacet.map((item) => [item.value, Number(item.count || 0)])
      }

      return getFilterOptionCounts(
        cards.flatMap((card) => getCardLanguages(card))
      )
    },
    [cards, filterFacets]
  )

  const filteredCards = useMemo(() => {
    if (filterFacets) return cards

    return cards.filter((card) => {
      const cardTypeMatches =
        cardTypeFilters.length === 0 || cardTypeFilters.includes(getCardType(card))
      const rarityMatches =
        rarityFilters.length === 0 ||
        rarityFilters.includes(normalizeRarity(getRarity(card)))
      const setMatches =
        setFilters.length === 0 || setFilters.includes(getSetName(card))
      const languageMatches =
        languageFilters.length === 0 ||
        languageFilters.some((language) =>
          getCardLanguages(card).includes(language)
        )

      return (
        cardTypeMatches &&
        rarityMatches &&
        setMatches &&
        languageMatches
      )
    })
  }, [
    cards,
    filterFacets,
    cardTypeFilters,
    rarityFilters,
    setFilters,
    languageFilters,
  ])

  const sortedCards = useMemo(() => {
    const sorted = [...filteredCards]

    switch (sortOption) {
      case 'price-low':
        sorted.sort((a, b) => (getMarketPrice(a) || 0) - (getMarketPrice(b) || 0))
        break
      case 'price-high':
        sorted.sort((a, b) => (getMarketPrice(b) || 0) - (getMarketPrice(a) || 0))
        break
      case 'name-asc':
        sorted.sort((a, b) => getCardName(a).localeCompare(getCardName(b)))
        break
      case 'name-desc':
        sorted.sort((a, b) => getCardName(b).localeCompare(getCardName(a)))
        break
      default:
        break
    }

    return sorted
  }, [filteredCards, sortOption])

  const advancedFilterCount =
    cardTypeFilters.length +
    rarityFilters.length +
    setFilters.length +
    languageFilters.length

  const advancedFilterGroups = [
    {
      key: 'cardType',
      label: 'Card Type',
      values: cardTypeFilters,
      setValues: setCardTypeFilters,
      options: cardTypeOptions,
    },
    {
      key: 'rarity',
      label: 'Rarity',
      values: rarityFilters,
      setValues: setRarityFilters,
      options: rarityOptions,
    },
    {
      key: 'set',
      label: 'Set',
      values: setFilters,
      setValues: setSetFilters,
      options: setOptions,
    },
    {
      key: 'language',
      label: 'Language',
      values: languageFilters,
      setValues: setLanguageFilters,
      options: languageOptions,
    },
  ]

  function applyFilterChange(setter, value) {
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    )
    setCurrentPage(1)
  }

  async function handleScanPhoto(scanResult) {
    const imageDataUrl = scanResult?.imageDataUrl || ''
    const numberRegionDataUrl = scanResult?.numberRegionDataUrl || ''

    if (!imageDataUrl) {
      setMessage('No card image was captured. Please try again.')
      return
    }

    setCapturedScanImage(imageDataUrl)
    setCapturedScanNumberRegion(numberRegionDataUrl)
    setScanAlternativesLoaded(false)
    setSelectedFromScan(false)
    setShowCardScanner(false)
    setMatchingScan(true)
    setScanProcessingLabel('Identifying card...')
    setMessage('Reading card...')

    const scanRequestStartedAt = performance.now()

    const { data, error } = await supabase.functions.invoke(
      'pokewallet-scan-match',
      {
        body: {
          image_data_url: imageDataUrl,
          number_region_data_url: numberRegionDataUrl,
        },
      }
    )

    const clientTotalMs = Math.round(performance.now() - scanRequestStartedAt)

    setMatchingScan(false)

    if (error) {
      console.error('Vision scan match failed:', error)
      setMessage('Vendly could not identify this card. Please try another photo.')
      return
    }

    const candidates = Array.isArray(data?.candidates)
      ? data.candidates
      : []

    const detected = data?.detected || null

    setScanDetected(detected)
    setScanTimings({
      ...(data?.timings || {}),
      client_total_ms: clientTotalMs,
      fast_path: Boolean(data?.debug?.fast_path),
    })
    setScanCandidates(candidates)
    setScanAlternativesLoaded(!data?.debug?.fast_path)

    cacheSearchResultImages(candidates)

    if (candidates.length === 0) {
      setShowScanMatches(true)
      setMessage('No confident card match found. Try scanning again.')
      return
    }

    setMessage('')

    if (isConfidentScanResult(candidates)) {
      setShowScanMatches(false)
      openAddTypeModal(
        candidates[0],
        isVendor ? 'inventory' : 'wishlist',
        true
      )
      return
    }

    setShowScanMatches(true)
  }

  function selectScannedCandidate(card) {
    setShowScanMatches(false)

    openAddTypeModal(
      card,
      isVendor ? 'inventory' : 'wishlist',
      true
    )
  }

  function isConfidentScanResult(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return false

    const topScore = Number(candidates[0]?.match_score || 0)
    const secondScore = Number(candidates[1]?.match_score || 0)

    // Auto-advance only when confidence is genuinely high and there isn't
    // another nearly-identical candidate competing with it.
    if (topScore < 90) return false
    if (candidates.length > 1 && topScore - secondScore < 10) return false

    return true
  }

  async function showOtherScanMatches() {
    setShowTypeModal(false)
    setShowRawModal(false)
    setShowGradedModal(false)
    setShowDestinationModal(false)
    setSelectedCard(null)
    setSelectedFromScan(false)
    setShowScanMatches(true)

    if (scanAlternativesLoaded || scanCandidates.length > 1) return
    if (!capturedScanImage || !scanDetected) return

    setScanAlternativesLoading(true)

    const startedAt = performance.now()

    const { data, error } = await supabase.functions.invoke(
      'pokewallet-scan-match',
      {
        body: {
          image_data_url: capturedScanImage,
          number_region_data_url: capturedScanNumberRegion,
          force_expanded: true,
          detected_override: scanDetected,
        },
      }
    )

    const clientTotalMs = Math.round(performance.now() - startedAt)
    setScanAlternativesLoading(false)

    if (error) {
      console.error('Expanded scan match failed:', error)
      setMessage('Unable to load other matches. Please try again.')
      return
    }

    const candidates = Array.isArray(data?.candidates)
      ? data.candidates
      : []

    setScanCandidates(candidates)
    setScanDetected(data?.detected || scanDetected)
    setScanTimings({
      ...(data?.timings || {}),
      client_total_ms: clientTotalMs,
      fast_path: Boolean(data?.debug?.fast_path),
    })
    setScanAlternativesLoaded(true)

    cacheSearchResultImages(candidates)
  }

  async function handleSlabLabelScan(scanResult) {
    const imageDataUrl = scanResult?.imageDataUrl || ''
    const labelRegionDataUrl = scanResult?.labelRegionDataUrl || ''

    if (!imageDataUrl) {
      setMessage('No slab image was captured. Please try again.')
      return
    }

    setShowCardScanner(false)
    setMatchingScan(true)
    setScanProcessingLabel('Reading Slab Label...')
    setMessage('Reading Slab label...')

    const { data, error } = await supabase.functions.invoke(
      'pokewallet-slab-match',
      {
        body: {
          image_data_url: imageDataUrl,
          label_region_data_url: labelRegionDataUrl,
        },
      }
    )

    setMatchingScan(false)

    if (error || !data) {
      console.error('Slab Label scan failed:', error || data)
      setMessage('Vendly could not read this slab label. Please try another photo.')
      return
    }

    const candidate = data?.candidate || null
    const detected = data?.detected || {}

    if (!candidate) {
      setMessage(
        detected?.card_name
          ? `Vendly read ${detected.card_name}, but could not confidently match the underlying card.`
          : 'Vendly could not confidently match the card on this slab label.'
      )
      return
    }

    if (isGuest) {
      setSelectedCard(candidate)
      setSelectedFromScan(true)
      setShowGuestPrompt(true)
      setMessage('')
      cacheSearchResultImages([candidate])
      return
    }

    const detectedGrade =
      String(detected?.grade || '').match(/10|9\.5|9|8\.5|8|7\.5|7|6\.5|6|5|4|3|2|1/)?.[0] ||
      '10'

    setSelectedCard(candidate)
    setSelectedFromScan(true)
    setAddDestination(isVendor ? 'inventory' : 'wishlist')
    setCondition('ANY')
    setGradeCompany('PSA')
    setGrade(detectedGrade)
    setCertNumber(String(detected?.cert_number || '').replace(/[^\d]/g, ''))
    setListingPrice('')
    setPurchasePrice('')
    setTargetPrice('')
    setPriority(2)
    setNotificationsEnabled(true)
    setQuantity(1)
    setPhysicalLocation('')
    setShowPublic(false)
    setSelectedShowIds([])
    setMessage('')

    cacheSearchResultImages([candidate])

    setShowTypeModal(false)
    setShowRawModal(false)
    setShowDestinationModal(false)
    setShowGradedModal(true)
  }

  const paginationItems = useMemo(() => {
    if (totalPages <= 1) return [1]

    const pages = new Set([
      1,
      totalPages,
      currentPage - 1,
      currentPage,
      currentPage + 1,
    ])

    const validPages = [...pages]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b)

    const items = []

    validPages.forEach((page, index) => {
      if (index > 0 && page - validPages[index - 1] > 1) {
        items.push(`ellipsis-${validPages[index - 1]}-${page}`)
      }

      items.push(page)
    })

    return items
  }, [currentPage, totalPages])

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <main className="mx-auto max-w-[430px] px-5 pt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Search</h1>
          <p className="mt-1 text-sm text-gray-400">
            {isVendor
              ? 'Search cards, sets, and add items to inventory.'
              : isGuest
              ? 'Search cards and discover where to find them at upcoming shows.'
              : 'Search cards, sets, and add items to your wishlist.'}
          </p>
        </div>

        {isGuest && (
          <section className="mb-6 overflow-hidden rounded-3xl border border-yellow-800/60 bg-gradient-to-br from-yellow-400/15 via-[#111] to-black p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="rounded-full border border-yellow-800/70 bg-yellow-950/40 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-yellow-300">
                Browsing as Guest
              </span>

              <button
                type="button"
                onClick={() => navigate('/?mode=signup&returnTo=/search')}
                className="text-xs font-bold text-white underline decoration-gray-700 underline-offset-4"
              >
                Sign Up
              </button>
            </div>

            <h2 className="max-w-[330px] text-3xl font-black leading-[1.08] text-white">
              Find the card. Find the show. Find the vendor.
            </h2>

            <p className="mt-3 max-w-[340px] text-sm leading-6 text-gray-400">
              Search cards, see which upcoming shows have them, and find the vendor booth before you arrive.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  document.querySelector('input[placeholder^="Search cards or sets"]')?.focus()
                }}
                className="rounded-xl bg-white p-3 text-sm font-black text-black"
              >
                Search Cards
              </button>

              <button
                type="button"
                onClick={() => navigate('/map')}
                className="rounded-xl border border-[#333] bg-black p-3 text-sm font-bold text-white"
              >
                Explore Shows
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowCardScanner(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-yellow-900/70 bg-yellow-950/20 p-3 text-sm font-bold text-yellow-300"
            >
              <Camera size={17} />
              Scan a Card Instantly
            </button>

            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center">
              <div>
                <p className="text-xs font-bold text-white">Search</p>
                <p className="mt-1 text-[10px] leading-4 text-gray-600">Find a card</p>
              </div>
              <div>
                <p className="text-xs font-bold text-white">Locate</p>
                <p className="mt-1 text-[10px] leading-4 text-gray-600">See the show</p>
              </div>
              <div>
                <p className="text-xs font-bold text-white">Find</p>
                <p className="mt-1 text-[10px] leading-4 text-gray-600">Go to the booth</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-blue-900/50 bg-blue-950/15 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-950/60 text-blue-300">
                  <Sparkles size={17} />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-white">Card Notifications</p>
                    <span className="rounded-full border border-blue-900/60 bg-blue-950/40 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-blue-300">
                      Coming Soon
                    </span>
                  </div>

                  <p className="mt-1 text-xs leading-5 text-gray-400">
                    Save the cards you&apos;re hunting and Vendly will alert you when a vendor brings a match to an upcoming show.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="mb-6">
          <div className="flex items-center rounded-2xl border border-[#222] bg-[#111] px-4">
            <SearchIcon size={18} className="text-gray-500" />

            <input
              placeholder="Search cards or sets, example: Charizard or Scarlet & Violet"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setActiveSearchQuery('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const typedQuery = search.trim()
                  setCurrentPage(1)
                  setActiveSearchQuery(typedQuery)
                  searchCards(1, typedQuery, {
                    displayQuery: typedQuery,
                    updateActiveQuery: false,
                  })
                }
              }}
              className="w-full bg-transparent p-4 text-white outline-none"
            />

            <button
              type="button"
              onClick={() => setShowCardScanner(true)}
              className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-[#1a1a1a] hover:text-yellow-300"
              aria-label="Scan card"
              title="Scan card"
            >
              <Camera size={19} />
            </button>

            {search && (
              <button
                onClick={() => {
                  setSearch('')
                  setActiveSearchQuery('')
                  setCards([])
                  setCurrentPage(1)
                  setTotalPages(1)
                  setTotalResults(0)
                  setMessage('')
                  searchPageMemory = null
                }}
                className="text-gray-500 hover:text-white"
              >
                <X size={18} />
              </button>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                const typedQuery = search.trim()
                setCurrentPage(1)
                setActiveSearchQuery(typedQuery)
                searchCards(1, typedQuery, {
                  displayQuery: typedQuery,
                  updateActiveQuery: false,
                })
              }}
              disabled={loading || !search.trim()}
              className="flex-1 rounded-xl bg-white p-4 font-semibold text-black disabled:opacity-60"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>

            <div className="relative">
              <button
                onClick={() => {
                  setShowSortMenu(!showSortMenu)
                  setShowFilterMenu(false)
                  setShowAdvancedFilterMenu(false)
                  setOpenAdvancedDropdown('')
                }}
                className="rounded-xl border border-[#222] bg-[#111] p-4"
              >
                <ArrowUpDown size={18} />
              </button>

              {showSortMenu && (
                <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-[#222] bg-[#111] p-2 shadow-xl">
                  {[
                    ['price-low', 'Price: Low to High (This Page)'],
                    ['price-high', 'Price: High to Low (This Page)'],
                    ['name-asc', 'Product Name: A to Z (This Page)'],
                    ['name-desc', 'Product Name: Z to A (This Page)'],
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

            <div className="relative">
              <button
                onClick={() => {
                  setShowFilterMenu(!showFilterMenu)
                  setShowSortMenu(false)
                  setShowAdvancedFilterMenu(false)
                  setOpenAdvancedDropdown('')
                }}
                className="rounded-xl border border-[#222] bg-[#111] p-4"
              >
                <SlidersHorizontal size={18} />
              </button>

              {showFilterMenu && (
                <div className="absolute right-0 z-40 mt-2 w-52 rounded-xl border border-[#222] bg-[#111] p-2 shadow-xl">
                  <p className="px-3 py-2 text-xs uppercase text-gray-500">
                    Product Type
                  </p>

                  <button
                    onClick={() => {
                      setFilterOption('cards')
                      setShowFilterMenu(false)
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#1a1a1a] ${
                      filterOption === 'cards' ? 'text-yellow-300' : 'text-white'
                    }`}
                  >
                    Cards Only
                  </button>

                  <button
                    onClick={() => {
                      setFilterOption('sealed')
                      setCards([])
                      setShowFilterMenu(false)
                      setMessage('Sealed product search will be added later.')
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#1a1a1a] ${
                      filterOption === 'sealed' ? 'text-yellow-300' : 'text-white'
                    }`}
                  >
                    Sealed Only
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const nextOpen = !showAdvancedFilterMenu
                  setShowAdvancedFilterMenu(nextOpen)
                  setOpenAdvancedDropdown('')
                  setShowSortMenu(false)
                  setShowFilterMenu(false)

                  if (nextOpen && search.trim() && !filterFacets) {
                    loadGlobalFilterFacets(search)
                  }
                }}
                className={`relative rounded-xl border p-4 transition ${
                  advancedFilterCount > 0
                    ? 'border-yellow-400 bg-yellow-400 text-black'
                    : 'border-[#222] bg-[#111] text-white'
                }`}
                aria-label="Card filters"
                title="Card filters"
              >
                <Funnel size={18} />
                {advancedFilterCount > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-black text-black">
                    {advancedFilterCount}
                  </span>
                )}
              </button>

              {showAdvancedFilterMenu && (
                <div className="absolute right-0 z-40 mt-2 w-[330px] max-w-[calc(100vw-40px)] rounded-2xl border border-[#222] bg-[#111] p-3 shadow-2xl">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">Card Filters</p>

                    <div className="flex items-center gap-3">
                      {advancedFilterCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCardTypeFilters([])
                            setRarityFilters([])
                            setSetFilters([])
                            setLanguageFilters([])
                            setCurrentPage(1)
                          }}
                          className="text-xs font-semibold text-yellow-300"
                        >
                          Clear Filters
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const backendQuery = String(
                            activeSearchQuery || search || ''
                          ).trim()

                          if (!backendQuery) return

                          setCurrentPage(1)
                          setShowAdvancedFilterMenu(false)
                          setOpenAdvancedDropdown('')

                          searchCards(1, backendQuery, {
                            displayQuery: search,
                            updateActiveQuery: false,
                          })
                        }}
                        disabled={loading || !(activeSearchQuery || search).trim()}
                        className="rounded-lg bg-yellow-400 px-3 py-2 text-xs font-black text-black disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  {loadingFilterFacets && (
                    <div className="mb-3 rounded-xl border border-[#222] bg-black px-3 py-2 text-xs text-gray-400">
                      Loading all filter options...
                    </div>
                  )}

                  <div className="space-y-2">
                    {advancedFilterGroups.map((group) => {
                      const isOpen = openAdvancedDropdown === group.key
                      const selectedCount = group.values.length

                      return (
                        <div key={group.key} className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenAdvancedDropdown(isOpen ? '' : group.key)
                            }
                            className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${
                              selectedCount > 0
                                ? 'border-yellow-500 bg-yellow-950/20 text-yellow-300'
                                : 'border-[#2b2b2b] bg-black text-white'
                            }`}
                          >
                            <span>
                              {group.label}
                              {selectedCount > 0 && (
                                <span className="ml-2 text-xs text-yellow-400">
                                  ({selectedCount})
                                </span>
                              )}
                            </span>

                            <ChevronDown
                              size={17}
                              className={`transition-transform ${
                                isOpen ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          {isOpen && (
                            <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-[#2b2b2b] bg-black p-2">
                              {group.options.length === 0 ? (
                                <p className="px-2 py-3 text-sm text-gray-500">
                                  No options on this results page.
                                </p>
                              ) : (
                                group.options.map(([value, count]) => {
                                  const checked = group.values.includes(value)

                                  return (
                                    <label
                                      key={value}
                                      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-[#171717]"
                                    >
                                      <span className="flex min-w-0 items-center gap-3">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() =>
                                            applyFilterChange(group.setValues, value)
                                          }
                                          className="h-4 w-4"
                                        />
                                        <span className="truncate text-sm text-white">
                                          {value}
                                        </span>
                                      </span>

                                      <span className="shrink-0 text-xs text-gray-500">
                                        ({count})
                                      </span>
                                    </label>
                                  )
                                })
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <p className="mt-3 text-[11px] leading-4 text-gray-600">
                    Options and counts are shared across every results page.
                  </p>
                </div>
              )}
            </div>
          </div>

          {advancedFilterCount > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {advancedFilterGroups.flatMap((group) =>
                group.values.map((value) => (
                  <button
                    key={`${group.key}-${value}`}
                    type="button"
                    onClick={() => {
                      const nextValues = group.values.filter((item) => item !== value)

                      group.setValues(nextValues)
                      setCurrentPage(1)

                      const backendQuery = String(
                        activeSearchQuery || search || ''
                      ).trim()

                      if (!backendQuery) return

                      const nextFilters = {
                        cardTypes:
                          group.key === 'cardType' ? nextValues : cardTypeFilters,
                        rarities:
                          group.key === 'rarity' ? nextValues : rarityFilters,
                        sets:
                          group.key === 'set' ? nextValues : setFilters,
                        languages:
                          group.key === 'language' ? nextValues : languageFilters,
                      }

                      searchCards(1, backendQuery, {
                        displayQuery: search,
                        updateActiveQuery: false,
                        filtersOverride: nextFilters,
                      })
                    }}
                    className="flex items-center gap-1 rounded-full border border-yellow-900 bg-yellow-950/30 px-3 py-1.5 text-xs font-semibold text-yellow-300"
                  >
                    {group.label}: {value} <X size={13} />
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {message && (
  <p
    className={`mb-4 rounded-xl border p-3 text-sm font-bold ${
      message.toLowerCase().includes('updated') ||
      message.toLowerCase().includes('added') ||
      message.toLowerCase().includes('merged') ||
      message.toLowerCase().includes('saved') ||
      message.toLowerCase().includes('recorded') ||
      message.toLowerCase().includes('assigned') ||
      message.toLowerCase().includes('marked') ||
      message.toLowerCase().includes('caching') ||
      message.toLowerCase().includes('checking') ||
      message.toLowerCase().includes('adding') ||
      message.toLowerCase().includes('assigning')
        ? 'border-green-900 bg-green-950/40 text-green-300'
        : 'border-red-900 bg-red-950/40 text-red-300'
    }`}
  >
    {message}
  </p>
)}

        {matchingScan && (
          <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/70 backdrop-blur-[2px]">
            <div className="flex min-w-[210px] flex-col items-center rounded-2xl border border-white/10 bg-[#111]/95 px-7 py-6 shadow-2xl">
              <div className="h-11 w-11 animate-spin rounded-full border-4 border-white/15 border-t-yellow-300" />
              <p className="mt-4 text-sm font-semibold text-white">
                {scanProcessingLabel}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {scanProcessingLabel === 'Reading Slab label...'
                  ? 'Reading slab label + matching results'
                  : 'Reading card + checking results'}
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
            <div className="flex min-w-[190px] flex-col items-center rounded-2xl border border-white/10 bg-[#111]/95 px-7 py-6 shadow-2xl">
              <div className="relative h-12 w-12">
                <div className="absolute inset-0 rounded-full border-4 border-white/15" />
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-yellow-300" />
                <div className="absolute inset-[15px] rounded-full bg-yellow-300" />
              </div>

              <p className="mt-4 text-sm font-semibold text-white">
                Loading cards...
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Finding the next results
              </p>
            </div>
          </div>
        )}

        {!loading && cards.length === 0 && filterOption === 'cards' && (
          <section className="mb-8 space-y-7">
            {loadingDiscovery && (
              <div className="rounded-2xl border border-[#222] bg-[#111] p-5">
                <div className="flex items-center gap-3">
                  <Sparkles size={18} className="text-yellow-300" />
                  <div>
                    <p className="font-semibold text-white">Loading discovery</p>
                    <p className="mt-1 text-sm text-gray-500">
                      Finding new sets and cards moving this week.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!loadingDiscovery && discovery.recent_sets.length > 0 && (
              <div>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles size={18} className="text-yellow-300" />
                      <h2 className="text-xl font-semibold">New Releases</h2>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Recently released English Pokémon sets
                    </p>
                  </div>
                </div>

                <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {discovery.recent_sets.map((set) => {
                    const setName =
                      set?.display_name || set?.name || 'Unknown Set'

                    return (
                      <button
                        key={set?.set_id || set?.set_code || setName}
                        type="button"
                        onClick={() => openDiscoverySet(set)}
                        className="w-[168px] shrink-0 overflow-hidden rounded-2xl border border-[#242424] bg-[#111] text-left transition hover:border-[#444]"
                      >
                        <div className="flex h-28 items-center justify-center border-b border-[#242424] bg-gradient-to-br from-[#181818] to-black p-5">
                          <div className="text-center">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-600">
                              Pokémon TCG
                            </p>
                            <p className="mt-2 line-clamp-3 text-sm font-black leading-5 text-white">
                              {setName}
                            </p>
                          </div>
                        </div>

                        <div className="p-3">
                          <p className="line-clamp-2 min-h-10 text-sm font-semibold text-white">
                            {setName}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {Number(set?.card_count || 0).toLocaleString()} cards
                          </p>
                          <p className="mt-1 text-[11px] text-gray-600">
                            {formatSetReleaseDate(set?.release_date)}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {!loadingDiscovery && discovery.top_movers.length > 0 && (
              <div>
                <div className="mb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={18} className="text-green-300" />
                    <h2 className="text-xl font-semibold">Top Movers</h2>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Cards with the strongest 7-day TCGPlayer price growth
                  </p>
                </div>

                <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {discovery.top_movers.map((card) => {
                    const imageUrl = getCardImage(card)
                    const price = getMarketPrice(card)

                    return (
                      <button
                        key={getCardId(card)}
                        type="button"
                        onClick={() => {
                          const query = getCardName(card)

                          runDiscoverySearch({
                            displayQuery: query,
                            searchQuery: query,
                          })
                        }}
                        className="w-[142px] shrink-0 text-left"
                      >
                        <div className="flex h-[178px] items-center justify-center overflow-hidden rounded-2xl border border-[#242424] bg-[#111]">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={getCardName(card)}
                              className="h-full w-full object-contain p-2"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#181818] to-black p-4 text-center">
                              <p className="text-sm font-bold text-gray-400">
                                {getCardName(card)}
                              </p>
                            </div>
                          )}
                        </div>

                        <p className="mt-2 line-clamp-1 text-sm font-semibold text-white">
                          {getCardName(card)}
                        </p>
                        <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                          {getSetName(card)}
                        </p>

                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-yellow-300">
                            {price ? `$${Number(price).toFixed(2)}` : '—'}
                          </span>
                          {card?.change_7d && (
                            <span className="text-[11px] font-bold text-green-300">
                              {card.change_7d}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {!loadingDiscovery && discovery.trending_sets.length > 0 && (
              <div>
                <div className="mb-3">
                  <div className="flex items-center gap-2">
                    <Flame size={18} className="text-orange-300" />
                    <h2 className="text-xl font-semibold">Trending Sets</h2>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Sets with the strongest CardMarket movement this week
                  </p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-[#222] bg-[#111]">
                  {discovery.trending_sets.map((set, index) => (
                    <button
                      key={`${set?.set_code || set?.set_name}-${index}`}
                      type="button"
                      onClick={() => openDiscoverySet(set)}
                      className={`flex w-full items-center gap-3 p-4 text-left transition hover:bg-[#171717] ${
                        index > 0 ? 'border-t border-[#222]' : ''
                      }`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black text-sm font-black text-gray-400">
                        {index + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {set?.set_name || 'Unknown Set'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {Number(set?.card_count || 0).toLocaleString()} cards
                          {set?.avg_price_current != null
                            ? ` • $${Number(set.avg_price_current).toFixed(2)} avg`
                            : ''}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {set?.price_change && (
                          <span
                            className={`text-xs font-bold ${
                              String(set.price_change).trim().startsWith('-')
                                ? 'text-red-300'
                                : 'text-green-300'
                            }`}
                          >
                            {set.price_change}
                          </span>
                        )}
                        <ArrowRight size={16} className="text-gray-600" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!loadingDiscovery &&
              discoveryLoaded &&
              discovery.recent_sets.length === 0 &&
              discovery.top_movers.length === 0 &&
              discovery.trending_sets.length === 0 && (
                <div className="rounded-2xl border border-[#222] bg-[#111] p-5 text-center">
                  <p className="font-semibold text-white">Start exploring</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Search for a card or set above.
                  </p>
                </div>
              )}
          </section>
        )}

        {cards.length > 0 && filterOption === 'cards' && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Results</h2>
              <p className="text-sm text-gray-500">
                {`${totalResults || sortedCards.length} found`}
              </p>
            </div>

            {sortedCards.length === 0 && advancedFilterCount > 0 && (
              <div className="mb-3 rounded-2xl border border-[#222] bg-[#111] p-5 text-center">
                <p className="font-semibold text-white">No cards match these filters on this page.</p>
                <p className="mt-1 text-sm text-gray-500">
                  Try changing or clearing one of your card filters.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {sortedCards.map((card) => {
                const imageUrl = getCardImage(card)
                const marketPrice = getMarketPrice(card)
                const marketContext = getMarketPriceContext(card)
                const cardId = getCardId(card)

                return (
                  <div
                    key={cardId}
                    className="flex min-h-[220px] items-start gap-5 rounded-2xl border border-[#222] bg-[#111] p-4"
                  >
                    <div className="aspect-[2.5/3.5] w-[138px] shrink-0 overflow-hidden rounded-xl border border-[#262626] bg-[#181818] sm:w-[150px]">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={getCardName(card)}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <CardImagePlaceholder
                          unavailable={
                            imageUnavailableIds.has(cardId) &&
                            !imageLoadingIds.has(cardId)
                          }
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 pt-1">
                      <p className="font-medium">{getCardName(card)}</p>

                      <p className="mt-1 text-sm text-gray-400">
                        {getSetName(card)} #{getCardNumber(card)}
                      </p>

                      <p className="mt-1 text-sm text-gray-400">
                        {getRarity(card)}
                      </p>

                      <p className="mt-2 font-semibold text-yellow-300">
                        {marketContext
                          ? `${marketContext.formatted} ${marketContext.label}`
                          : 'No market data'}
                      </p>

                      {isVendor && (
                        <p className="mt-1 text-sm text-gray-500">
                          Qty: {inventoryCounts[cardId] || 0}
                        </p>
                      )}

                      <button
                        onClick={() => openAddTypeModal(card)}
                        className="mt-3 flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
                      >
                        <Plus size={16} />
                        Add
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            
            <div className="mt-5 rounded-2xl border border-[#222] bg-[#111] p-3">
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    searchCards(currentPage - 1, activeSearchQuery || search, {
                      displayQuery: search,
                    })
                  }
                  disabled={loading || currentPage <= 1}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#222] text-sm font-semibold disabled:opacity-30"
                  aria-label="Previous page"
                >
                  ‹‹
                </button>

                {paginationItems.map((item) =>
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      type="button"
                      onClick={() =>
                        searchCards(item, activeSearchQuery || search, {
                          displayQuery: search,
                        })
                      }
                      disabled={loading || item === currentPage}
                      className={`flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-bold ${
                        item === currentPage
                          ? 'border-white bg-white text-black'
                          : 'border-[#222] bg-black text-white'
                      } disabled:cursor-default`}
                    >
                      {item}
                    </button>
                  ) : (
                    <span
                      key={item}
                      className="flex h-10 min-w-6 items-center justify-center text-sm text-gray-500"
                    >
                      …
                    </span>
                  )
                )}

                <button
                  type="button"
                  onClick={() =>
                    searchCards(currentPage + 1, activeSearchQuery || search, {
                      displayQuery: search,
                    })
                  }
                  disabled={loading || currentPage >= totalPages}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#222] text-sm font-semibold disabled:opacity-30"
                  aria-label="Next page"
                >
                  ››
                </button>
              </div>
            </div>

          </section>
        )}
      </main>

      {showDestinationModal && selectedCard && isVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5">
          <div className="w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Choose Destination</h2>
              <button
                onClick={() => {
                  setShowDestinationModal(false)
                  setSelectedCard(null)
                }}
              >
                <X size={22} />
              </button>
            </div>

            <p className="mb-4 text-sm text-gray-400">
              Where would you like to add {getCardName(selectedCard)}?
            </p>

            <button
              onClick={() => chooseAddDestination('wishlist')}
              className="mb-3 w-full rounded-xl bg-white p-4 text-left text-black"
            >
              <span className="block font-semibold">Wishlist</span>
              <span className="mt-1 block text-xs text-gray-600">
                Save it as a card you want to find.
              </span>
            </button>

            <button
              onClick={() => chooseAddDestination('inventory')}
              className="w-full rounded-xl border border-[#222] bg-[#1a1a1a] p-4 text-left"
            >
              <span className="block font-semibold">Vendor Inventory</span>
              <span className="mt-1 block text-xs text-gray-400">
                Add it as stock you own and may list for sale.
              </span>
            </button>
          </div>
        </div>
      )}

      {showTypeModal && selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5">
          <div className="w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Add Item</h2>
              <button
                onClick={() => {
                  // X means cancel the entire add flow.
                  // Do not navigate backward into Choose Destination.
                  setShowTypeModal(false)
                  setShowDestinationModal(false)
                  setShowRawModal(false)
                  setShowGradedModal(false)
                  setSelectedCard(null)
                  setSelectedFromScan(false)
                  setAddDestination('')
                  setCertNumber('')
                }}
              >
                <X size={22} />
              </button>
            </div>

            <div className="mb-4 flex items-start gap-4 rounded-2xl border border-[#222] bg-black/60 p-3">
              <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#181818]">
                {getCardImage(selectedCard) ? (
                  <img
                    src={getCardImage(selectedCard)}
                    alt={getCardName(selectedCard)}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] text-gray-600">
                    Loading image...
                  </div>
                )}
              </div>

              <div className="min-w-0 pt-1">
                <p className="font-bold text-white">
                  {getCardName(selectedCard)}
                </p>

                <p className="mt-1 text-sm text-gray-400">
                  {getSetName(selectedCard)} #{getCardNumber(selectedCard)}
                </p>

                <p className="mt-3 text-sm leading-5 text-gray-400">
                  Choose whether this card is raw or graded for your{' '}
                  {addingToInventory ? 'vendor inventory' : 'wishlist'}.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setShowTypeModal(false)
                setShowRawModal(true)
              }}
              className="mb-3 w-full rounded-xl bg-white p-4 font-semibold text-black"
            >
              Raw
            </button>

            <button
              onClick={() => {
                setShowTypeModal(false)
                setShowGradedModal(true)
              }}
              className="w-full rounded-xl border border-[#222] bg-[#1a1a1a] p-4 font-semibold"
            >
              Graded
            </button>

            {selectedFromScan && (
              <button
                type="button"
                onClick={showOtherScanMatches}
                className="mt-4 w-full text-center text-sm font-semibold text-blue-300 hover:text-blue-200"
              >
                Not the right card?
              </button>
            )}
          </div>
        </div>
      )}

      {showRawModal && selectedCard && (
        <AddModal
          title={addingToInventory ? 'Add Raw Inventory' : 'Add Raw Wishlist Card'}
          selectedCard={selectedCard}
          getCardName={getCardName}
          getSetName={getSetName}
          getCardNumber={getCardNumber}
          getRarity={getRarity}
          imageUrl={getCardImage(selectedCard)}
          marketPrice={getMarketPrice(selectedCard)}
          marketPriceContext={getMarketPriceContext(selectedCard)}
          suggestedPrice={getSuggestedPrice(selectedCard, 'raw', condition)}
          purchasePrice={purchasePrice}
          setPurchasePrice={setPurchasePrice}
          listingPrice={listingPrice}
          setListingPrice={setListingPrice}
          quantity={quantity}
          setQuantity={setQuantity}
          physicalLocation={physicalLocation}
          setPhysicalLocation={setPhysicalLocation}
          showPublic={showPublic}
          setShowPublic={setShowPublic}
          lists={addingToInventory ? lists : wishlistLists}
          selectedListId={addingToInventory ? selectedListId : selectedWishlistListId}
          setSelectedListId={addingToInventory ? setSelectedListId : setSelectedWishlistListId}
          targetPrice={targetPrice}
          setTargetPrice={setTargetPrice}
          priority={priority}
          setPriority={setPriority}
          notificationsEnabled={notificationsEnabled}
          setNotificationsEnabled={setNotificationsEnabled}
          vendorShows={vendorShows}
          selectedShowIds={selectedShowIds}
          toggleSelectedShow={toggleSelectedShow}
          formatEventDate={formatEventDate}
          isVendor={isVendor}
          addingToInventory={addingToInventory}
          saving={saving}
          onClose={() => setShowRawModal(false)}
          onWrongCard={selectedFromScan ? showOtherScanMatches : null}
          onAdd={() =>
            addingToInventory ? addToInventory('raw') : addToWishlist('raw')
          }
        >
          <label className="mb-2 block text-sm text-gray-400">Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
          >
            {!addingToInventory && <option value="ANY">Any Condition</option>}
            <option value="NM">Near Mint</option>
            <option value="LP">Lightly Played</option>
            <option value="MP">Moderately Played</option>
            <option value="HP">Heavily Played</option>
            <option value="DMG">Damaged</option>
          </select>
        </AddModal>
      )}

      {showGradedModal && selectedCard && (
        <AddModal
          title={
            addingToInventory
              ? 'Add Graded Inventory'
              : 'Add Graded Wishlist Card'
          }
          selectedCard={selectedCard}
          getCardName={getCardName}
          getSetName={getSetName}
          getCardNumber={getCardNumber}
          getRarity={getRarity}
          imageUrl={getCardImage(selectedCard)}
          marketPrice={getMarketPrice(selectedCard)}
          marketPriceContext={getMarketPriceContext(selectedCard)}
          suggestedPrice={getSuggestedPrice(selectedCard, 'graded', condition)}
          purchasePrice={purchasePrice}
          setPurchasePrice={setPurchasePrice}
          listingPrice={listingPrice}
          setListingPrice={setListingPrice}
          quantity={quantity}
          setQuantity={setQuantity}
          physicalLocation={physicalLocation}
          setPhysicalLocation={setPhysicalLocation}
          showPublic={showPublic}
          setShowPublic={setShowPublic}
          lists={addingToInventory ? lists : wishlistLists}
          selectedListId={addingToInventory ? selectedListId : selectedWishlistListId}
          setSelectedListId={addingToInventory ? setSelectedListId : setSelectedWishlistListId}
          targetPrice={targetPrice}
          setTargetPrice={setTargetPrice}
          priority={priority}
          setPriority={setPriority}
          notificationsEnabled={notificationsEnabled}
          setNotificationsEnabled={setNotificationsEnabled}
          vendorShows={vendorShows}
          selectedShowIds={selectedShowIds}
          toggleSelectedShow={toggleSelectedShow}
          formatEventDate={formatEventDate}
          isVendor={isVendor}
          addingToInventory={addingToInventory}
          saving={saving}
          onClose={() => setShowGradedModal(false)}
          onWrongCard={selectedFromScan ? showOtherScanMatches : null}
          onAdd={() =>
            addingToInventory ? addToInventory('graded') : addToWishlist('graded')
          }
        >
          <label className="mb-2 block text-sm text-gray-400">Grade Company</label>
          <select
            value={gradeCompany}
            onChange={(e) => setGradeCompany(e.target.value)}
            className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
          >
            <option value="PSA">PSA</option>
            <option value="CGC">CGC</option>
            <option value="Beckett">Beckett</option>
            <option value="SGC">SGC</option>
            <option value="TAG">TAG</option>
            <option value="Other">Other</option>
          </select>

          <label className="mb-2 block text-sm text-gray-400">Grade</label>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
          >
            {[
              '10',
              '9.5',
              '9',
              '8.5',
              '8',
              '7.5',
              '7',
              '6.5',
              '6',
              '5',
              '4',
              '3',
              '2',
              '1',
            ].map((num) => (
              <option key={num} value={num}>
                {num}
              </option>
            ))}
          </select>

          {gradeCompany === 'PSA' && (
            <>
              <label className="mb-2 block text-sm text-gray-400">
                PSA Certification # <span className="text-gray-600">(optional)</span>
              </label>
              <input
                inputMode="numeric"
                placeholder="Example: 12345678"
                value={certNumber}
                onChange={(e) =>
                  setCertNumber(e.target.value.replace(/[^\d]/g, ''))
                }
                className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
              />
            </>
          )}
        </AddModal>
      )}

      {showScanMatches && (
        <div className="fixed inset-0 z-[116] overflow-y-auto bg-black/85 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Possible Matches</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {scanDetected?.name
                    ? `Detected: ${scanDetected.name}${
                        scanDetected?.card_number
                          ? ` • ${scanDetected.card_number}`
                          : ''
                      }`
                    : 'Choose the card that matches your scan.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowScanMatches(false)}
                className="text-gray-500 hover:text-white"
              >
                <X size={21} />
              </button>
            </div>


            {scanTimings && (
              <div className="mb-4 rounded-xl border border-[#2a2a2a] bg-black/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Temporary Scan Timing
                  </p>
                  <span className="rounded-full bg-[#1d1d1d] px-2 py-1 text-[10px] font-semibold text-gray-400">
                    {scanTimings.fast_path ? 'Fast result' : 'Expanded search'}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <span className="text-gray-500">OpenAI vision</span>
                  <span className="text-right text-white">
                    {scanTimings.openai_vision_ms != null
                      ? `${(scanTimings.openai_vision_ms / 1000).toFixed(2)}s`
                      : '—'}
                  </span>

                  <span className="text-gray-500">PokéWallet targeted</span>
                  <span className="text-right text-white">
                    {scanTimings.pokewallet_fast_search_ms != null
                      ? `${(scanTimings.pokewallet_fast_search_ms / 1000).toFixed(2)}s`
                      : '—'}
                  </span>

                  <span className="text-gray-500">PokéWallet expanded</span>
                  <span className="text-right text-white">
                    {scanTimings.pokewallet_fallback_ms != null
                      ? `${(scanTimings.pokewallet_fallback_ms / 1000).toFixed(2)}s`
                      : '—'}
                  </span>

                  <span className="text-gray-500">Candidate ranking</span>
                  <span className="text-right text-white">
                    {scanTimings.candidate_ranking_ms != null
                      ? `${scanTimings.candidate_ranking_ms.toFixed(1)}ms`
                      : '—'}
                  </span>

                  <span className="border-t border-[#222] pt-2 font-semibold text-gray-300">
                    Edge Function total
                  </span>
                  <span className="border-t border-[#222] pt-2 text-right font-semibold text-white">
                    {scanTimings.total_ms != null
                      ? `${(scanTimings.total_ms / 1000).toFixed(2)}s`
                      : '—'}
                  </span>

                  <span className="font-semibold text-yellow-300">
                    Browser → result
                  </span>
                  <span className="text-right font-semibold text-yellow-300">
                    {scanTimings.client_total_ms != null
                      ? `${(scanTimings.client_total_ms / 1000).toFixed(2)}s`
                      : '—'}
                  </span>
                </div>
              </div>
            )}

            {scanAlternativesLoading ? (
              <div className="rounded-xl border border-[#222] bg-black p-5 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-white/15 border-t-yellow-300" />
                <p className="mt-3 text-sm font-semibold text-white">
                  Finding other possible matches...
                </p>
              </div>
            ) : scanCandidates.length === 0 ? (
              <div className="rounded-xl border border-[#222] bg-black p-5 text-center">
                <p className="font-semibold text-white">No confident match</p>
                <p className="mt-1 text-sm text-gray-500">
                  Try taking another photo with the name and card number clearly visible.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setShowScanMatches(false)
                    setScanTimings(null)
                    setSelectedFromScan(false)
                    setScanAlternativesLoaded(false)
                    setShowCardScanner(true)
                  }}
                  className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-bold text-black"
                >
                  Scan Again
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {scanCandidates.map((card) => {
                  const imageUrl = getCardImage(card)
                  const marketContext = getMarketPriceContext(card)

                  return (
                    <button
                      key={getCardId(card)}
                      type="button"
                      onClick={() => selectScannedCandidate(card)}
                      className="flex w-full gap-4 rounded-2xl border border-[#222] bg-black p-3 text-left transition hover:border-[#444]"
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={getCardName(card)}
                          className="w-20 rounded-lg"
                        />
                      ) : (
                        <div className="h-28 w-20 shrink-0 rounded-lg bg-[#191919]" />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-white">
                            {getCardName(card)}
                          </p>

                          <span className="shrink-0 rounded-full bg-yellow-400 px-2 py-1 text-[10px] font-black text-black">
                            {Number(card?.match_score || 0)}%
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-gray-400">
                          {getSetName(card)} #{getCardNumber(card)}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {getRarity(card)}
                        </p>

                        <p className="mt-2 text-sm font-semibold text-yellow-300">
                          {marketContext
                            ? `${marketContext.formatted} ${marketContext.label}`
                            : 'No market data'}
                        </p>
                      </div>
                    </button>
                  )
                })}

                <button
                  type="button"
                  onClick={() => {
                    setShowScanMatches(false)
                    setScanTimings(null)
                    setSelectedFromScan(false)
                    setScanAlternativesLoaded(false)
                    setShowCardScanner(true)
                  }}
                  className="w-full rounded-xl border border-[#2a2a2a] bg-[#171717] p-3 text-sm font-semibold text-gray-300"
                >
                  None of these — Scan Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showGuestPrompt && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-5">
          <div className="w-full max-w-sm rounded-3xl border border-[#2a2a2a] bg-[#111] p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-yellow-300">
                  Free account
                </p>
                <h2 className="mt-2 text-2xl font-bold">Save it with Vendly</h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowGuestPrompt(false)
                  setSelectedCard(null)
                  setSelectedFromScan(false)
                }}
                className="rounded-full border border-[#2a2a2a] bg-black p-2 text-gray-400"
              >
                <X size={18} />
              </button>
            </div>

            {selectedCard && (
              <div className="mb-4 rounded-2xl border border-[#222] bg-black p-3">
                <p className="font-semibold text-white">{getCardName(selectedCard)}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {getSetName(selectedCard)} #{getCardNumber(selectedCard)}
                </p>
              </div>
            )}

            <p className="text-sm leading-6 text-gray-400">
              Guests can search and scan cards without an account. Create a free
              account to add cards to your wishlist, save your collection, and keep
              your finds between visits.
            </p>

            <button
              type="button"
              onClick={() => navigate('/?mode=signup&returnTo=/search')}
              className="mt-5 w-full rounded-xl bg-white p-4 font-bold text-black"
            >
              Create Free Account
            </button>

            <button
              type="button"
              onClick={() => {
                setShowGuestPrompt(false)
                setSelectedCard(null)
                setSelectedFromScan(false)
              }}
              className="mt-3 w-full rounded-xl border border-[#2a2a2a] bg-black p-4 text-sm font-semibold text-gray-300"
            >
              Keep Browsing
            </button>
          </div>
        </div>
      )}

      <CardScanner
        open={showCardScanner}
        onClose={() => setShowCardScanner(false)}
        onConfirm={handleScanPhoto}
        onSlabConfirm={handleSlabLabelScan}
      />

      <Navbar />
    </div>
  )
}

function AddModal({
  title,
  selectedCard,
  getCardName,
  getSetName,
  getCardNumber,
  getRarity,
  imageUrl,
  marketPrice,
  marketPriceContext,
  suggestedPrice,
  purchasePrice,
  setPurchasePrice,
  listingPrice,
  setListingPrice,
  quantity,
  setQuantity,
  physicalLocation,
  setPhysicalLocation,
  showPublic,
  setShowPublic,
  lists,
  selectedListId,
  setSelectedListId,
  targetPrice,
  setTargetPrice,
  priority,
  setPriority,
  notificationsEnabled,
  setNotificationsEnabled,
  vendorShows,
  selectedShowIds,
  toggleSelectedShow,
  formatEventDate,
  isVendor,
  addingToInventory,
  saving,
  onClose,
  onWrongCard,
  onAdd,
  children,
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/80 px-3"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[#222] bg-[#111]">
        <div className="flex shrink-0 items-center justify-between border-b border-[#1f1f1f] bg-[#111] px-5 py-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#171717]"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-5 flex gap-4">
          {imageUrl && (
            <img
              src={imageUrl}
              alt={getCardName(selectedCard)}
              className="w-20 rounded-lg"
            />
          )}

          <div>
            <p className="font-medium">{getCardName(selectedCard)}</p>
            <p className="mt-1 text-sm text-gray-400">
              {getSetName(selectedCard)} #{getCardNumber(selectedCard)}
            </p>
            <p className="mt-1 text-sm text-gray-400">
              {getRarity(selectedCard)}
            </p>

            <p className="mt-2 text-sm font-semibold text-yellow-300">
              {marketPriceContext
                ? `${marketPriceContext.formatted} ${marketPriceContext.label}`
                : 'No market data'}
            </p>
          </div>
        </div>

        {onWrongCard && (
          <button
            type="button"
            onClick={onWrongCard}
            className="mb-5 -mt-2 text-sm font-semibold text-blue-300 hover:text-blue-200"
          >
            Not the right card?
          </button>
        )}

        {children}

        <label className="mb-2 block text-sm text-gray-400">{addingToInventory ? 'Inventory List' : 'Wishlist'}</label>
        <select
          value={selectedListId}
          onChange={(e) => setSelectedListId(e.target.value)}
          className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
        >
          {lists.length === 0 ? (
            <option value="">No lists found</option>
          ) : (
            lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))
          )}
        </select>

        {!addingToInventory && (
          <>
            <label className="mb-2 block text-sm text-gray-400">
              Target Price <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Notify me at or below this price"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <label className="mb-5 flex items-center gap-3 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
              />
              Notify me when a matching vendor card is available
            </label>
          </>
        )}

        {addingToInventory && (
        <div className="mb-4 rounded-2xl border border-[#222] bg-black p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Assign to Show</p>
              <p className="mt-1 text-xs text-gray-500">
                Optional. Only shows you are vending at appear here.
              </p>
            </div>
            <CalendarDays className="shrink-0 text-blue-300" size={18} />
          </div>

          {!vendorShows || vendorShows.length === 0 ? (
            <p className="rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-gray-400">
              No vendor shows found. Join a show from the Shows page first.
            </p>
          ) : (
            <div className="space-y-2">
              {vendorShows.map((event) => {
                const assigned = selectedShowIds.includes(event.id)

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => toggleSelectedShow(event.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      assigned
                        ? 'border-blue-800 bg-blue-950/40'
                        : 'border-[#222] bg-[#111] hover:border-[#444]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{event.name}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          {event.venue || 'Venue TBD'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {[event.city, event.state].filter(Boolean).join(', ')}
                        </p>
                        {event.booth_number && (
                          <p className="mt-1 text-xs font-semibold text-blue-300">
                            Booth {event.booth_number}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-gray-500">
                          {formatEventDate(event.starts_at)}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                          assigned
                            ? 'bg-blue-400 text-black'
                            : 'bg-[#1a1a1a] text-gray-400'
                        }`}
                      >
                        {assigned ? 'Assigned' : 'Add'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        )}

        {addingToInventory && (
          <>
            <label className="mb-2 block text-sm text-gray-400">Purchase Price</label>
            <input
              type="number"
              step="0.01"
              placeholder="What did you pay?"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <label className="mb-2 block text-sm text-gray-400">Listing Price</label>

            {suggestedPrice && (
              <div className="mb-3 rounded-xl border border-yellow-900 bg-yellow-950/20 p-3">
                <p className="text-xs text-gray-400">Suggested price</p>
                <p className="text-lg font-bold text-yellow-300">
                  ${Number(suggestedPrice).toFixed(2)}
                </p>
                <button
                  type="button"
                  onClick={() => setListingPrice(Number(suggestedPrice).toFixed(2))}
                  className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black"
                >
                  Use Suggested Price
                </button>
              </div>
            )}

            <input
              type="number"
              step="0.01"
              placeholder={
                suggestedPrice
                  ? `Auto uses $${Number(suggestedPrice).toFixed(2)} if blank`
                  : 'Enter your price'
              }
              value={listingPrice}
              onChange={(e) => setListingPrice(e.target.value)}
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <label className="mb-2 block text-sm text-gray-400">Quantity</label>
            <select
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </select>
          </>
        )}

        {addingToInventory && (
          <>
            <label className="mb-2 block text-sm text-gray-400">
              Physical Location
            </label>
            <input
              placeholder="Example: Binder 1, Row 2"
              value={physicalLocation}
              onChange={(e) => setPhysicalLocation(e.target.value)}
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />
          </>
        )}

        {addingToInventory && (
          <label className="mb-5 flex items-center gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={showPublic}
              onChange={(e) => setShowPublic(e.target.checked)}
            />
            Make public
          </label>
        )}

        </div>

        <div
          className="shrink-0 border-t border-[#1f1f1f] bg-[#111] px-5 pt-4"
          style={{
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          }}
        >
          <button
            onClick={onAdd}
            disabled={saving}
            className="w-full rounded-xl bg-white p-4 font-semibold text-black disabled:opacity-60"
          >
            {saving
              ? 'Adding...'
              : addingToInventory
              ? 'Add to Inventory'
              : 'Add to Wishlist'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Search 