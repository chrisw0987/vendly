import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

import {
  Search as SearchIcon,
  ArrowUpDown,
  SlidersHorizontal,
  Plus,
  CalendarDays,
  X,
} from 'lucide-react'

function Search() {
  const [search, setSearch] = useState('')
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [sortOption, setSortOption] = useState('')
  const [filterOption, setFilterOption] = useState('cards')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showFilterMenu, setShowFilterMenu] = useState(false)

  const [inventoryCounts, setInventoryCounts] = useState({})
  const [lists, setLists] = useState([])
  const [selectedListId, setSelectedListId] = useState('')

  const [selectedCard, setSelectedCard] = useState(null)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [showRawModal, setShowRawModal] = useState(false)
  const [showGradedModal, setShowGradedModal] = useState(false)

  const [condition, setCondition] = useState('NM')
  const [gradeCompany, setGradeCompany] = useState('PSA')
  const [grade, setGrade] = useState('10')

  const [quantity, setQuantity] = useState(1)
  const [physicalLocation, setPhysicalLocation] = useState('')
  const [showPublic, setShowPublic] = useState(false)
  const [listingPrice, setListingPrice] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [vendorShows, setVendorShows] = useState([])
  const [selectedShowIds, setSelectedShowIds] = useState([])
  const [accountType, setAccountType] = useState('user')

  const isVendor = accountType === 'vendor' || accountType === 'admin'

  useEffect(() => {
    fetchAccountType()
    fetchInventoryCounts()
    fetchInventoryLists()
    fetchVendorShows()
  }, [])

  useEffect(() => {
    if (!search.trim()) {
      setCards([])
      setMessage('')
      return
    }

    const delaySearch = setTimeout(() => {
      searchCards()
    }, 500)

    return () => clearTimeout(delaySearch)
  }, [search, filterOption])

  function getCardId(card) {
    return card?.id || card?.card_id || card?.tcgplayer_id || card?.uuid || getCardName(card)
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

  function getCardImage(card) {
    if (!card?.id) return null

    return `https://xkwqzfncwiiaqpzbmhaf.supabase.co/functions/v1/pokewallet-image?id=${encodeURIComponent(
      card.id
    )}`
  }

  function getMarketPrice(card) {
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

    if (!user) return

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

  async function searchCards() {
    if (!search.trim()) return

    if (filterOption === 'sealed') {
      setCards([])
      setMessage('Sealed product search will be added later.')
      return
    }

    setLoading(true)
    setMessage('')

    const { data, error } = await supabase.functions.invoke('pokewallet-search', {
      body: { query: search },
    })

    if (error) {
      setMessage(error.message || 'Error connecting to PokéWallet.')
      setCards([])
      setLoading(false)
      return
    }

    const results = data?.results || data?.data || data?.cards || []

    setCards(results)
    setLoading(false)
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

  function openAddTypeModal(card) {
    setSelectedCard(card)
    setListingPrice('')
    setPurchasePrice('')
    setCondition('NM')
    setGradeCompany('PSA')
    setGrade('10')
    setQuantity(1)
    setPhysicalLocation('')
    setShowPublic(false)
    setSelectedShowIds([])
    setShowTypeModal(true)
  }

  async function cacheSelectedCardImage(card) {
    const cardId = getCardId(card)

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

  const sortedCards = useMemo(() => {
    const sorted = [...cards]

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
  }, [cards, sortOption])

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <main className="mx-auto max-w-[430px] px-5 pt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Search</h1>
          <p className="mt-1 text-sm text-gray-400">
            {isVendor ? 'Search cards, sets, and add items to inventory.' : 'Search cards, sets, and track items in your collection.'}
          </p>
        </div>

        <div className="mb-6">
          <div className="flex items-center rounded-2xl border border-[#222] bg-[#111] px-4">
            <SearchIcon size={18} className="text-gray-500" />

            <input
              placeholder="Search cards, example: Charizard"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent p-4 text-white outline-none"
            />

            {search && (
              <button
                onClick={() => {
                  setSearch('')
                  setCards([])
                  setMessage('')
                }}
                className="text-gray-500 hover:text-white"
              >
                <X size={18} />
              </button>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={searchCards}
              disabled={loading}
              className="flex-1 rounded-xl bg-white p-4 font-semibold text-black disabled:opacity-60"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>

            <div className="relative">
              <button
                onClick={() => {
                  setShowSortMenu(!showSortMenu)
                  setShowFilterMenu(false)
                }}
                className="rounded-xl border border-[#222] bg-[#111] p-4"
              >
                <ArrowUpDown size={18} />
              </button>

              {showSortMenu && (
                <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-[#222] bg-[#111] p-2 shadow-xl">
                  {[
                    ['price-low', 'Price: Low to High'],
                    ['price-high', 'Price: High to Low'],
                    ['name-asc', 'Product Name: A to Z'],
                    ['name-desc', 'Product Name: Z to A'],
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
          </div>
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

        {loading && <p className="mb-4 text-sm text-gray-400">Searching...</p>}

        {!loading && cards.length === 0 && filterOption === 'cards' && (
          <section className="mb-8">
            <h2 className="mb-3 text-xl font-semibold">Trending Searches</h2>

            <div className="flex flex-wrap gap-2">
              {['Charizard', 'Umbreon', 'Pikachu', 'Gengar', 'Mew'].map((item) => (
                <button
                  key={item}
                  onClick={() => setSearch(item)}
                  className="rounded-full border border-[#222] bg-[#111] px-4 py-2 text-sm"
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        )}

        {cards.length > 0 && filterOption === 'cards' && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Results</h2>
              <p className="text-sm text-gray-500">{sortedCards.length} found</p>
            </div>

            <div className="space-y-3">
              {sortedCards.map((card) => {
                const imageUrl = getCardImage(card)
                const marketPrice = getMarketPrice(card)
                const cardId = getCardId(card)

                return (
                  <div
                    key={cardId}
                    className="flex gap-4 rounded-2xl border border-[#222] bg-[#111] p-3"
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={getCardName(card)}
                        className="w-20 rounded-lg"
                      />
                    ) : (
                      <div className="h-28 w-20 rounded-lg bg-[#1a1a1a]" />
                    )}

                    <div className="flex-1">
                      <p className="font-medium">{getCardName(card)}</p>

                      <p className="mt-1 text-sm text-gray-400">
                        {getSetName(card)} #{getCardNumber(card)}
                      </p>

                      <p className="mt-1 text-sm text-gray-400">
                        {getRarity(card)}
                      </p>

                      <p className="mt-2 font-semibold text-yellow-300">
                        {marketPrice
                          ? `$${Number(marketPrice).toFixed(2)} market`
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
          </section>
        )}
      </main>

      {showTypeModal && selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5">
          <div className="w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Add Item</h2>
              <button onClick={() => setShowTypeModal(false)}>
                <X size={22} />
              </button>
            </div>

            <p className="mb-4 text-sm text-gray-400">
              Choose how you want to add {getCardName(selectedCard)}.
            </p>

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
          </div>
        </div>
      )}

      {showRawModal && selectedCard && (
        <AddModal
          title="Add Raw Card"
          selectedCard={selectedCard}
          getCardName={getCardName}
          getSetName={getSetName}
          getCardNumber={getCardNumber}
          getRarity={getRarity}
          imageUrl={getCardImage(selectedCard)}
          marketPrice={getMarketPrice(selectedCard)}
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
          lists={lists}
          selectedListId={selectedListId}
          setSelectedListId={setSelectedListId}
          vendorShows={vendorShows}
          selectedShowIds={selectedShowIds}
          toggleSelectedShow={toggleSelectedShow}
          formatEventDate={formatEventDate}
          isVendor={isVendor}
          saving={saving}
          onClose={() => setShowRawModal(false)}
          onAdd={() => addToInventory('raw')}
        >
          <label className="mb-2 block text-sm text-gray-400">Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
          >
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
          title="Add Graded Card"
          selectedCard={selectedCard}
          getCardName={getCardName}
          getSetName={getSetName}
          getCardNumber={getCardNumber}
          getRarity={getRarity}
          imageUrl={getCardImage(selectedCard)}
          marketPrice={getMarketPrice(selectedCard)}
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
          lists={lists}
          selectedListId={selectedListId}
          setSelectedListId={setSelectedListId}
          vendorShows={vendorShows}
          selectedShowIds={selectedShowIds}
          toggleSelectedShow={toggleSelectedShow}
          formatEventDate={formatEventDate}
          isVendor={isVendor}
          saving={saving}
          onClose={() => setShowGradedModal(false)}
          onAdd={() => addToInventory('graded')}
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
        </AddModal>
      )}

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
  vendorShows,
  selectedShowIds,
  toggleSelectedShow,
  formatEventDate,
  isVendor,
  saving,
  onClose,
  onAdd,
  children,
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-5">
      <div className="mx-auto mt-8 w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose}>
            <X size={22} />
          </button>
        </div>

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
              {marketPrice
                ? `$${Number(marketPrice).toFixed(2)} market`
                : 'No market data'}
            </p>
          </div>
        </div>

        {children}

        <label className="mb-2 block text-sm text-gray-400">{isVendor ? 'Inventory List' : 'Collection List'}</label>
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

        {isVendor && (
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

        {isVendor && (
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

        {isVendor && (
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

        {isVendor && (
          <label className="mb-5 flex items-center gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={showPublic}
              onChange={(e) => setShowPublic(e.target.checked)}
            />
            Make public
          </label>
        )}

        <button
          onClick={onAdd}
          disabled={saving}
          className="w-full rounded-xl bg-white p-4 font-semibold text-black disabled:opacity-60"
        >
          {saving
            ? 'Adding...'
            : isVendor
            ? 'Add to Inventory'
            : 'Add to Collection'}
        </button>
      </div>
    </div>
  )
}

export default Search
