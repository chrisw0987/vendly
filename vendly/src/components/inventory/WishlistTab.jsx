import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronRight,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  Search as SearchIcon,
  Store,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

const GRADE_OPTIONS = [
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
]


function WishlistTab() {
  const navigate = useNavigate()

  const [lists, setLists] = useState([])
  const [items, setItems] = useState([])
  const [selectedListId, setSelectedListId] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortOption, setSortOption] = useState('name-asc')
  const [selectedItemIds, setSelectedItemIds] = useState([])
  const [editingItem, setEditingItem] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [matchSummaries, setMatchSummaries] = useState({})
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [selectedMatchItem, setSelectedMatchItem] = useState(null)
  const [matchDetails, setMatchDetails] = useState([])
  const [matchDetailsLoading, setMatchDetailsLoading] = useState(false)
  const [matchDetailsError, setMatchDetailsError] = useState('')

  const [editForm, setEditForm] = useState({
    wishlist_list_id: '',
    item_type: 'raw',
    desired_condition: 'ANY',
    grade_company: 'PSA',
    desired_grade: '10',
    target_price: '',
    desired_quantity: 1,
    notes: '',
    notifications_enabled: true,
  })

  useEffect(() => {
    setupWishlist()
  }, [])
  
  
  useEffect(() => {
    if (selectedListId) {
      fetchWishlistItems(selectedListId)
    }
  }, [selectedListId])

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

  async function setupWishlist() {
    setLoading(true)
    setMessage('')

    const user = await getUserOrRedirect()
    if (!user) return

    const { data, error } = await supabase
      .from('wishlist_lists')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    if (data?.length) {
      setLists(data)
      setSelectedListId(data[0].id)
      setLoading(false)
      return
    }

    const { data: newList, error: createError } = await supabase
      .from('wishlist_lists')
      .insert({
        owner_id: user.id,
        name: 'Main Wishlist',
      })
      .select()
      .single()

    if (createError) {
      setMessage(createError.message)
      setLoading(false)
      return
    }

    setLists([newList])
    setSelectedListId(newList.id)
    setLoading(false)
  }

  async function fetchWishlistItems(listId) {
    setLoading(true)
    setMatchesLoading(true)
    setMessage('')

    const user = await getUserOrRedirect()
    if (!user) return

    const [
      { data: wishlistData, error: wishlistError },
      { data: summaryData, error: summaryError },
    ] = await Promise.all([
      supabase
        .from('wishlist_items')
        .select('*')
        .eq('owner_id', user.id)
        .eq('wishlist_list_id', listId)
        .order('created_at', { ascending: false }),
      supabase.rpc('get_user_wishlist_summary'),
    ])

    if (wishlistError) {
      setItems([])
      setMessage(wishlistError.message)
    } else {
      setItems(wishlistData || [])
    }

    if (summaryError) {
      setMatchSummaries({})
      setMessage((current) =>
        current
          ? `${current} Match summary: ${summaryError.message}`
          : `Match summary: ${summaryError.message}`
      )
    } else {
      const summaryMap = (summaryData || []).reduce((map, summary) => {
        map[summary.wishlist_item_id] = summary
        return map
      }, {})

      setMatchSummaries(summaryMap)
    }

    setSelectedItemIds([])
    setMatchesLoading(false)
    setLoading(false)
  }

  async function refreshWishlistMatchSummary() {
    setMatchesLoading(true)

    const { data, error } = await supabase.rpc('get_user_wishlist_summary')

    if (error) {
      setMessage(`Match summary: ${error.message}`)
      setMatchesLoading(false)
      return
    }

    const summaryMap = (data || []).reduce((map, summary) => {
      map[summary.wishlist_item_id] = summary
      return map
    }, {})

    setMatchSummaries(summaryMap)
    setMatchesLoading(false)
  }

  async function openMatchesModal(item) {
    setSelectedMatchItem(item)
    setMatchDetails([])
    setMatchDetailsError('')
    setMatchDetailsLoading(true)

    const { data, error } = await supabase.rpc(
      'get_wishlist_item_matches',
      {
        p_wishlist_item_id: item.id,
      }
    )

    if (error) {
      setMatchDetailsError(error.message)
    } else {
      setMatchDetails(data || [])
    }

    setMatchDetailsLoading(false)
  }

  function closeMatchesModal() {
    setSelectedMatchItem(null)
    setMatchDetails([])
    setMatchDetailsError('')
    setMatchDetailsLoading(false)
  }

  async function createWishlistList() {
    const name = window.prompt('Name your new wishlist:')

    if (!name?.trim()) return

    const user = await getUserOrRedirect()
    if (!user) return

    setActionLoading('Creating wishlist...')
    setMessage('')

    const { data, error } = await supabase
      .from('wishlist_lists')
      .insert({
        owner_id: user.id,
        name: name.trim(),
      })
      .select()
      .single()

    setActionLoading('')

    if (error) {
      setMessage(
        error.code === '23505'
          ? 'You already have a wishlist with that name.'
          : error.message
      )
      return
    }

    setLists((current) => [...current, data])
    setSelectedListId(data.id)
    setItems([])
    setMessage('Wishlist created.')
  }

  async function renameSelectedList() {
    const selectedList = lists.find((list) => list.id === selectedListId)
    if (!selectedList) return

    const nextName = window.prompt('Rename this wishlist:', selectedList.name)
    if (!nextName?.trim()) return

    setActionLoading('Renaming wishlist...')
    setMessage('')

    const { error } = await supabase
      .from('wishlist_lists')
      .update({ name: nextName.trim() })
      .eq('id', selectedList.id)

    setActionLoading('')

    if (error) {
      setMessage(
        error.code === '23505'
          ? 'You already have a wishlist with that name.'
          : error.message
      )
      return
    }

    setLists((current) =>
      current.map((list) =>
        list.id === selectedList.id
          ? { ...list, name: nextName.trim() }
          : list
      )
    )
    setMessage('Wishlist renamed.')
  }

  async function deleteSelectedList() {
    const selectedList = lists.find((list) => list.id === selectedListId)
    if (!selectedList) return

    const confirmed = window.confirm(
      `Delete ${selectedList.name} and every card inside it?`
    )
    if (!confirmed) return

    const user = await getUserOrRedirect()
    if (!user) return

    setActionLoading('Deleting wishlist...')
    setMessage('')

    const { error } = await supabase
      .from('wishlist_lists')
      .delete()
      .eq('id', selectedList.id)
      .eq('owner_id', user.id)

    if (error) {
      setActionLoading('')
      setMessage(error.message)
      return
    }

    const remainingLists = lists.filter((list) => list.id !== selectedList.id)

    if (remainingLists.length > 0) {
      setLists(remainingLists)
      setSelectedListId(remainingLists[0].id)
      setItems([])
      setActionLoading('')
      setMessage('Wishlist deleted.')
      return
    }

    const { data: newList, error: createError } = await supabase
      .from('wishlist_lists')
      .insert({
        owner_id: user.id,
        name: 'Main Wishlist',
      })
      .select()
      .single()

    setActionLoading('')

    if (createError) {
      setLists([])
      setSelectedListId('')
      setItems([])
      setMessage(createError.message)
      return
    }

    setLists([newList])
    setSelectedListId(newList.id)
    setItems([])
    setMessage('Wishlist deleted. A new Main Wishlist was created.')
  }

  function openEditModal(item) {
    setEditingItem(item)
    setEditForm({
      wishlist_list_id: item.wishlist_list_id,
      item_type: item.item_type || 'raw',
      desired_condition: item.desired_condition || 'ANY',
      grade_company: item.grade_company || 'PSA',
      desired_grade: item.desired_grade || '10',
      target_price:
        item.target_price === null || item.target_price === undefined
          ? ''
          : String(item.target_price),
      desired_quantity: Number(item.desired_quantity || 1),
      notes: item.notes || '',
      notifications_enabled: item.notifications_enabled !== false,
    })
  }

  async function saveEdit() {
    if (!editingItem || actionLoading) return

    const updates = {
      wishlist_list_id: editForm.wishlist_list_id,
      item_type: editForm.item_type,
      desired_condition:
        editForm.item_type === 'raw' ? editForm.desired_condition : null,
      grade_company:
        editForm.item_type === 'graded' ? editForm.grade_company : null,
      desired_grade:
        editForm.item_type === 'graded' ? editForm.desired_grade : null,
      target_price:
        editForm.target_price === '' ? null : Number(editForm.target_price),
      desired_quantity: Math.max(1, Number(editForm.desired_quantity || 1)),
      notes: editForm.notes.trim() || null,
      notifications_enabled: editForm.notifications_enabled,
    }

    setActionLoading('Updating wishlist item...')
    setMessage('')

    const { error } = await supabase
      .from('wishlist_items')
      .update(updates)
      .eq('id', editingItem.id)

    setActionLoading('')

    if (error) {
      setMessage(
        error.code === '23505'
          ? 'That exact card request already exists in the selected wishlist.'
          : error.message
      )
      return
    }

    if (updates.wishlist_list_id !== selectedListId) {
      setItems((current) =>
        current.filter((item) => item.id !== editingItem.id)
      )
      setSelectedItemIds((current) =>
        current.filter((id) => id !== editingItem.id)
      )
    } else {
      setItems((current) =>
        current.map((item) =>
          item.id === editingItem.id ? { ...item, ...updates } : item
        )
      )
    }

    setEditingItem(null)
    setMessage('Wishlist item updated.')
    await refreshWishlistMatchSummary()
  }

  async function toggleNotifications(item) {
    const nextValue = !item.notifications_enabled

    const { error } = await supabase
      .from('wishlist_items')
      .update({ notifications_enabled: nextValue })
      .eq('id', item.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? { ...currentItem, notifications_enabled: nextValue }
          : currentItem
      )
    )

    setMessage(
      nextValue
        ? 'Match notifications enabled.'
        : 'Match notifications disabled.'
    )
  }

  function requestDelete(item) {
    setDeleteConfirm({
      itemIds: [item.id],
      message: `Delete ${item.card_name || 'this card'} from your wishlist?`,
    })
  }

  function requestBulkDelete() {
    if (selectedItemIds.length === 0) return

    setDeleteConfirm({
      itemIds: selectedItemIds,
      message: `Delete ${selectedItemIds.length} selected wishlist item${
        selectedItemIds.length === 1 ? '' : 's'
      }?`,
    })
  }

  async function performDelete() {
    if (!deleteConfirm?.itemIds?.length || actionLoading) return

    const ids = deleteConfirm.itemIds
    setDeleteConfirm(null)
    setActionLoading('Deleting wishlist item...')
    setMessage('')

    const { error } = await supabase
      .from('wishlist_items')
      .delete()
      .in('id', ids)

    setActionLoading('')

    if (error) {
      setMessage(error.message)
      return
    }

    setItems((current) => current.filter((item) => !ids.includes(item.id)))
    setSelectedItemIds((current) => current.filter((id) => !ids.includes(id)))
    setMatchSummaries((current) => {
      const next = { ...current }
      ids.forEach((id) => delete next[id])
      return next
    })

    if (selectedMatchItem && ids.includes(selectedMatchItem.id)) {
      closeMatchesModal()
    }

    setMessage(
      ids.length === 1
        ? 'Wishlist item deleted.'
        : 'Selected wishlist items deleted.'
    )
  }

  function matchesSearch(item) {
    const query = search.trim().toLowerCase()
    if (!query) return true

    return [
      item.card_name,
      item.set_name,
      item.card_number,
      item.rarity,
      item.desired_condition,
      item.grade_company,
      item.desired_grade,
      item.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query)
  }

  function matchesFilter(item) {
    if (filter === 'raw') return item.item_type !== 'graded'
    if (filter === 'graded') return item.item_type === 'graded'
    if (filter === 'notifications') return item.notifications_enabled
    return true
  }

  function matchesTypeFilter(item) {
    if (typeFilter === 'raw') return item.item_type !== 'graded'
    if (typeFilter === 'graded') return item.item_type === 'graded'
    return true
  }

  function getWishlistSortPrice(item) {
    return Number(item.target_price ?? Number.POSITIVE_INFINITY)
  }

  function sortWishlistItems(list) {
    const sorted = [...list]

    switch (sortOption) {
      case 'name-desc':
        return sorted.sort((a, b) =>
          String(b.card_name || '').localeCompare(String(a.card_name || ''))
        )
      case 'price-low':
        return sorted.sort(
          (a, b) => getWishlistSortPrice(a) - getWishlistSortPrice(b)
        )
      case 'price-high':
        return sorted.sort(
          (a, b) => getWishlistSortPrice(b) - getWishlistSortPrice(a)
        )
      case 'name-asc':
      default:
        return sorted.sort((a, b) =>
          String(a.card_name || '').localeCompare(String(b.card_name || ''))
        )
    }
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === '') return null
    return `$${Number(value).toFixed(2)}`
  }

  function formatEventDate(value) {
    if (!value) return 'Date unavailable'

    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  }

  function getPriceStatusLabel(status, targetPrice) {
    const formattedTarget = formatMoney(targetPrice)

    if (status === 'below_target') {
      return formattedTarget
        ? `Below your ${formattedTarget} target`
        : 'Below target'
    }

    if (status === 'at_target') {
      return formattedTarget
        ? `At your ${formattedTarget} target`
        : 'At target'
    }

    if (status === 'above_target') {
      return formattedTarget
        ? `Above your ${formattedTarget} target`
        : 'Above target'
    }

    if (status === 'price_not_listed') return 'Price not listed'
    return 'No target price'
  }

  function getPriceStatusClasses(status) {
    if (status === 'below_target') {
      return 'border-green-900 bg-green-950/40 text-green-300'
    }

    if (status === 'at_target') {
      return 'border-blue-900 bg-blue-950/40 text-blue-300'
    }

    if (status === 'above_target') {
      return 'border-orange-900 bg-orange-950/30 text-orange-300'
    }

    return 'border-[#333] bg-black text-gray-400'
  }

  function getTcgPlayerSearchUrl(item) {
    const query = [item.card_name, item.set_name].filter(Boolean).join(' ')
    return `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(
      query
    )}&view=grid`
  }

  function toggleSelected(itemId) {
    setSelectedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    )
  }

  const filteredItems = useMemo(
    () =>
      sortWishlistItems(
        items.filter(
          (item) =>
            matchesSearch(item) &&
            matchesFilter(item) &&
            matchesTypeFilter(item)
        )
      ),
    [items, search, filter, typeFilter, sortOption]
  )

  const filterOptions = [
    { value: 'all', label: 'All', count: items.length },
    {
      value: 'raw',
      label: 'Raw',
      count: items.filter((item) => item.item_type !== 'graded').length,
    },
    {
      value: 'graded',
      label: 'Graded',
      count: items.filter((item) => item.item_type === 'graded').length,
    },
    {
      value: 'notifications',
      label: 'Alerts On',
      count: items.filter((item) => item.notifications_enabled).length,
    },
  ]

  return (
    <section>
      <div className="mb-5 flex items-center justify-center gap-2">
          <select
            value={selectedListId}
            onChange={(event) => setSelectedListId(event.target.value)}
            className="max-w-[220px] rounded-xl border border-[#222] bg-[#111] px-4 py-3 text-center text-sm font-semibold text-white outline-none"
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>

          <button
            onClick={renameSelectedList}
            disabled={!selectedListId || !!actionLoading}
            className="rounded-xl border border-[#222] bg-[#111] p-3 disabled:opacity-40"
            aria-label="Rename wishlist"
          >
            <Pencil size={18} />
          </button>

          <button
            onClick={deleteSelectedList}
            disabled={!selectedListId || !!actionLoading}
            className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-red-300 disabled:opacity-40"
            aria-label="Delete wishlist"
          >
            <Trash2 size={18} />
          </button>

          <button
            onClick={createWishlistList}
            disabled={!!actionLoading}
            className="rounded-xl border border-[#222] bg-[#111] p-3 disabled:opacity-40"
            aria-label="Create wishlist"
          >
            <Plus size={18} />
          </button>
      </div>

      {message && (
        <p
          className={`mb-4 rounded-xl border p-3 text-sm font-bold ${
            message.toLowerCase().includes('error') ||
            message.toLowerCase().includes('already') ||
            message.toLowerCase().includes('must')
              ? 'border-red-900 bg-red-950/40 text-red-300'
              : 'border-green-900 bg-green-950/40 text-green-300'
          }`}
        >
          {message}
        </p>
      )}

      {actionLoading && (
        <p className="mb-4 rounded-xl border border-blue-900 bg-blue-950/40 p-3 text-sm font-bold text-blue-300">
          {actionLoading}
        </p>
      )}

      {loading && <p className="text-sm text-gray-400">Loading wishlist...</p>}

      {!loading && items.length > 0 && (
        <div className="mb-5 space-y-3">
          <div className="flex items-center rounded-2xl border border-[#222] bg-[#111] px-4">
            <SearchIcon size={18} className="text-gray-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search wishlist..."
              className="w-full bg-transparent p-4 text-white outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-gray-500 hover:text-white"
              >
                <X size={18} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="w-full rounded-xl border border-[#222] bg-[#111] px-4 py-3 text-sm font-semibold text-white outline-none"
            >
              <option value="all">All Types</option>
              <option value="raw">Raw Only</option>
              <option value="graded">Slab Only</option>
            </select>

            <select
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value)}
              className="w-full rounded-xl border border-[#222] bg-[#111] px-4 py-3 text-sm font-semibold text-white outline-none"
            >
              <option value="name-asc">Name: A–Z</option>
              <option value="name-desc">Name: Z–A</option>
              <option value="price-low">Price: Low–High</option>
              <option value="price-high">Price: High–Low</option>
            </select>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
                  filter === option.value
                    ? 'border-white bg-white text-black'
                    : 'border-[#222] bg-[#111] text-gray-400'
                }`}
              >
                {option.label} {option.count}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                setSelectedItemIds(filteredItems.map((item) => item.id))
              }
              disabled={filteredItems.length === 0 || !!actionLoading}
              className="rounded-xl border border-[#222] bg-[#111] px-4 py-3 text-xs font-semibold text-gray-300 disabled:opacity-40"
            >
              Select all shown
            </button>

            {selectedItemIds.length > 0 && (
              <>
                <button
                  onClick={() => setSelectedItemIds([])}
                  className="rounded-xl border border-[#222] bg-[#111] px-4 py-3 text-xs font-semibold text-gray-300"
                >
                  Cancel {selectedItemIds.length}
                </button>

                <button
                  onClick={requestBulkDelete}
                  className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-xs font-bold text-red-300"
                >
                  Delete Selected
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-2xl border border-[#222] bg-[#111] p-6 text-center">
          <Package className="mx-auto mb-3 text-gray-500" size={36} />
          <h3 className="text-lg font-semibold">No wishlist cards yet</h3>
          <p className="mt-1 text-sm text-gray-400">
            Cards you add to your wishlist from Search will appear here.
          </p>
          <Link
            to="/search"
            className="mt-5 block rounded-xl bg-white p-4 font-semibold text-black"
          >
            Search Cards
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Wanted Cards</h3>
            <p className="text-sm text-gray-500">{filteredItems.length} shown</p>
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-[#222] bg-[#111] p-6 text-center">
              <Package className="mx-auto mb-3 text-gray-500" size={36} />
              <h3 className="text-lg font-semibold">No matching cards</h3>
              <p className="mt-1 text-sm text-gray-400">
                Try changing your search or filter.
              </p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <article
                key={item.id}
                className={`rounded-3xl border bg-[#111] p-4 ${
                  selectedItemIds.includes(item.id)
                    ? 'border-blue-700'
                    : 'border-[#222]'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                    <input
                      type="checkbox"
                      checked={selectedItemIds.includes(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      className="h-4 w-4 accent-blue-500"
                    />
                    Select
                  </label>

                  <button
                    onClick={() => toggleNotifications(item)}
                    className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${
                      item.notifications_enabled
                        ? 'border-green-900 bg-green-950/40 text-green-300'
                        : 'border-[#333] bg-black text-gray-500'
                    }`}
                  >
                    {item.notifications_enabled ? (
                      <Bell size={13} />
                    ) : (
                      <BellOff size={13} />
                    )}
                    {item.notifications_enabled ? 'Alerts On' : 'Alerts Off'}
                  </button>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#222] bg-black">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.card_name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <Package className="text-gray-600" size={28} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words text-lg font-bold leading-tight">
                          {item.card_name}
                        </p>
                        <p className="mt-2 text-sm text-gray-400">
                          {item.set_name || 'Set N/A'}
                          {item.card_number ? ` #${item.card_number}` : ''}
                        </p>
                      </div>

                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => openEditModal(item)}
                          className="rounded-xl p-2 text-gray-500 hover:bg-[#1a1a1a] hover:text-white"
                          aria-label="Edit wishlist item"
                        >
                          <Pencil size={18} />
                        </button>

                        <button
                          onClick={() => requestDelete(item)}
                          className="rounded-xl p-2 text-gray-500 hover:bg-[#1a1a1a] hover:text-red-400"
                          aria-label="Delete wishlist item"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full border border-[#2a2a2a] bg-black px-2.5 py-1 text-gray-300">
                        {item.item_type === 'graded'
                          ? `${item.grade_company || 'Graded'} ${
                              item.desired_grade || ''
                            }`
                          : item.desired_condition === 'ANY' ||
                              !item.desired_condition
                            ? 'Any Condition'
                            : item.desired_condition}
                      </span>

                      <span className="rounded-full border border-[#2a2a2a] bg-black px-2.5 py-1 text-gray-300">
                        Qty {item.desired_quantity || 1}
                      </span>
                    </div>

                    <div className="mt-3 rounded-2xl border border-yellow-900/60 bg-yellow-950/20 p-3">
                      <p className="text-xs text-gray-400">Target Price</p>
                      <p className="font-bold text-yellow-300">
                        {formatMoney(item.target_price) || 'Any price'}
                      </p>
                    </div>

                    {matchesLoading && !matchSummaries[item.id] ? (
                      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[#222] bg-black p-3 text-sm text-gray-400">
                        <Loader2 size={16} className="animate-spin" />
                        Checking show inventory...
                      </div>
                    ) : Number(matchSummaries[item.id]?.total_matches || 0) > 0 ? (
                      <button
                        type="button"
                        onClick={() => openMatchesModal(item)}
                        className="mt-3 w-full rounded-2xl border border-green-900 bg-green-950/30 p-3 text-left transition hover:bg-green-950/50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-green-300">
                              {matchSummaries[item.id].total_matches}{' '}
                              {Number(matchSummaries[item.id].total_matches) === 1
                                ? 'match'
                                : 'matches'}{' '}
                              available
                            </p>

                            <p className="mt-1 text-xs text-gray-300">
                              Lowest price:{' '}
                              <span className="font-bold text-white">
                                {formatMoney(matchSummaries[item.id].lowest_price) ||
                                  'Not listed'}
                              </span>
                            </p>
                          </div>

                          <ChevronRight
                            size={20}
                            className="mt-1 shrink-0 text-green-300"
                          />
                        </div>

                        {matchSummaries[item.id].best_event_name && (
                          <div className="mt-3 space-y-1 border-t border-green-900/60 pt-3 text-xs text-gray-300">
                            <p className="flex items-center gap-2">
                              <MapPin size={14} className="text-green-300" />
                              {matchSummaries[item.id].best_event_name}
                              {matchSummaries[item.id].best_booth_number
                                ? ` · Booth ${matchSummaries[item.id].best_booth_number}`
                                : ''}
                            </p>

                            <p
                              className={`inline-flex rounded-full border px-2.5 py-1 font-bold ${getPriceStatusClasses(
                                matchSummaries[item.id].best_price_status
                              )}`}
                            >
                              {getPriceStatusLabel(
                                matchSummaries[item.id].best_price_status,
                                item.target_price
                              )}
                            </p>

                            {matchSummaries[item.id].best_is_saved_show && (
                              <p className="font-bold text-blue-300">
                                Saved show
                              </p>
                            )}
                          </div>
                        )}
                      </button>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-[#222] bg-black p-3">
                        <p className="text-sm font-semibold text-gray-400">
                          No show matches yet
                        </p>
                        <p className="mt-1 text-xs text-gray-600">
                          We will show public vendor listings here when an exact
                          match is assigned to an upcoming show.
                        </p>
                      </div>
                    )}

                    <p className="mt-3 text-xs text-gray-500">
                      Double check market on TCGplayer{' '}
                      <a
                        href={getTcgPlayerSearchUrl(item)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-yellow-300 underline"
                      >
                        HERE
                      </a>
                    </p>
                  </div>
                </div>

                {item.notes && (
                  <p className="mt-3 rounded-2xl border border-[#222] bg-black p-3 text-sm text-gray-400">
                    {item.notes}
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      )}

      {selectedMatchItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-5">
          <div className="mx-auto mt-8 w-full max-w-lg rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-green-300">
                  Vendor matches
                </p>
                <h3 className="mt-1 text-xl font-semibold">
                  {selectedMatchItem.card_name}
                </h3>
                <p className="mt-1 text-sm text-gray-400">
                  {selectedMatchItem.item_type === 'graded'
                    ? `${selectedMatchItem.grade_company || 'Graded'} ${
                        selectedMatchItem.desired_grade || ''
                      }`
                    : selectedMatchItem.desired_condition === 'ANY' ||
                        !selectedMatchItem.desired_condition
                      ? 'Any raw condition'
                      : selectedMatchItem.desired_condition}
                </p>
              </div>

              <button
                onClick={closeMatchesModal}
                className="rounded-xl p-2 text-gray-400 hover:bg-black hover:text-white"
                aria-label="Close matches"
              >
                <X size={22} />
              </button>
            </div>

            {matchDetailsLoading && (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#222] bg-black p-8 text-sm text-gray-400">
                <Loader2 size={18} className="animate-spin" />
                Loading vendor matches...
              </div>
            )}

            {!matchDetailsLoading && matchDetailsError && (
              <p className="rounded-2xl border border-red-900 bg-red-950/40 p-4 text-sm font-semibold text-red-300">
                {matchDetailsError}
              </p>
            )}

            {!matchDetailsLoading &&
              !matchDetailsError &&
              matchDetails.length === 0 && (
                <div className="rounded-2xl border border-[#222] bg-black p-6 text-center">
                  <Package className="mx-auto mb-3 text-gray-600" size={32} />
                  <p className="font-semibold">No matches are available now.</p>
                  <p className="mt-1 text-sm text-gray-500">
                    The listing may have been sold, hidden, or removed from the
                    show.
                  </p>
                </div>
              )}

            {!matchDetailsLoading &&
              !matchDetailsError &&
              matchDetails.length > 0 && (
                <div className="space-y-3">
                  {matchDetails.map((match, index) => {
                    const booth =
                      match.booth_number || match.booth || 'Not assigned'
                    const startsAt =
                      match.event_starts_at ||
                      match.starts_at ||
                      match.best_event_starts_at
                    const priceStatus =
                      match.price_status ||
                      (match.listing_price === null
                        ? 'price_not_listed'
                        : selectedMatchItem.target_price === null
                          ? 'no_target_price'
                          : Number(match.listing_price) <
                              Number(selectedMatchItem.target_price)
                            ? 'below_target'
                            : Number(match.listing_price) ===
                                Number(selectedMatchItem.target_price)
                              ? 'at_target'
                              : 'above_target')

                    return (
                      <article
                        key={
                          match.inventory_item_id ||
                          `${match.vendor_id || match.vendor_name}-${match.event_id || match.event_name}-${index}`
                        }
                        className="rounded-2xl border border-[#222] bg-black p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="flex items-center gap-2 font-bold">
                              <Store size={16} className="text-green-300" />
                              {match.vendor_name ||
                                match.display_name ||
                                'Vendor'}
                            </p>
                            <p className="mt-1 flex items-center gap-2 text-sm text-gray-400">
                              <MapPin size={14} />
                              {match.event_name || 'Show unavailable'}
                            </p>
                          </div>

                          {match.is_saved_show && (
                            <span className="shrink-0 rounded-full border border-blue-900 bg-blue-950/40 px-2.5 py-1 text-xs font-bold text-blue-300">
                              Saved show
                            </span>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-[#222] bg-[#111] p-3">
                            <p className="text-xs text-gray-500">Listing price</p>
                            <p className="mt-1 font-bold text-white">
                              {formatMoney(match.listing_price) ||
                                'Price not listed'}
                            </p>
                          </div>

                          <div className="rounded-xl border border-[#222] bg-[#111] p-3">
                            <p className="text-xs text-gray-500">Booth</p>
                            <p className="mt-1 font-bold text-white">{booth}</p>
                          </div>

                          <div className="rounded-xl border border-[#222] bg-[#111] p-3">
                            <p className="text-xs text-gray-500">Available</p>
                            <p className="mt-1 font-bold text-white">
                              Qty {match.quantity || 1}
                            </p>
                          </div>

                          <div className="rounded-xl border border-[#222] bg-[#111] p-3">
                            <p className="text-xs text-gray-500">Show date</p>
                            <p className="mt-1 text-sm font-bold text-white">
                              {formatEventDate(startsAt)}
                            </p>
                          </div>
                        </div>

                        <p
                          className={`mt-3 inline-flex rounded-full border px-3 py-1.5 text-xs font-bold ${getPriceStatusClasses(
                            priceStatus
                          )}`}
                        >
                          {getPriceStatusLabel(
                            priceStatus,
                            selectedMatchItem.target_price
                          )}
                        </p>
                      </article>
                    )
                  })}
                </div>
              )}
          </div>
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-5">
          <div className="mx-auto mt-8 w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold">Edit Wishlist Item</h3>
              <button onClick={() => setEditingItem(null)}>
                <X size={22} />
              </button>
            </div>

            <div className="mb-5 flex gap-4">
              {editingItem.image_url && (
                <img
                  src={editingItem.image_url}
                  alt={editingItem.card_name}
                  className="h-32 w-24 rounded-xl bg-black object-contain"
                />
              )}
              <div>
                <p className="font-medium">{editingItem.card_name}</p>
                <p className="mt-1 text-sm text-gray-400">
                  {editingItem.set_name || 'Set N/A'}
                  {editingItem.card_number
                    ? ` #${editingItem.card_number}`
                    : ''}
                </p>
              </div>
            </div>

            <label className="mb-2 block text-sm text-gray-400">
              Wishlist
            </label>
            <select
              value={editForm.wishlist_list_id}
              onChange={(event) =>
                setEditForm({
                  ...editForm,
                  wishlist_list_id: event.target.value,
                })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>

            <label className="mb-2 block text-sm text-gray-400">Card Type</label>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {['raw', 'graded'].map((type) => (
                <button
                  key={type}
                  onClick={() => setEditForm({ ...editForm, item_type: type })}
                  className={`rounded-xl border p-3 text-sm font-bold capitalize ${
                    editForm.item_type === type
                      ? 'border-white bg-white text-black'
                      : 'border-[#222] bg-black text-gray-400'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {editForm.item_type === 'raw' ? (
              <>
                <label className="mb-2 block text-sm text-gray-400">
                  Desired Condition
                </label>
                <select
                  value={editForm.desired_condition}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      desired_condition: event.target.value,
                    })
                  }
                  className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                >
                  <option value="ANY">Any Condition</option>
                  <option value="NM">Near Mint</option>
                  <option value="LP">Lightly Played</option>
                  <option value="MP">Moderately Played</option>
                  <option value="HP">Heavily Played</option>
                  <option value="DMG">Damaged</option>
                </select>
              </>
            ) : (
              <>
                <label className="mb-2 block text-sm text-gray-400">
                  Grading Company
                </label>
                <select
                  value={editForm.grade_company}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      grade_company: event.target.value,
                    })
                  }
                  className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                >
                  <option value="PSA">PSA</option>
                  <option value="CGC">CGC</option>
                  <option value="Beckett">Beckett</option>
                  <option value="SGC">SGC</option>
                  <option value="TAG">TAG</option>
                  <option value="Other">Other</option>
                </select>

                <label className="mb-2 block text-sm text-gray-400">
                  Desired Grade
                </label>
                <select
                  value={editForm.desired_grade}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      desired_grade: event.target.value,
                    })
                  }
                  className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                >
                  {GRADE_OPTIONS.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label className="mb-2 block text-sm text-gray-400">
              Target Price
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.target_price}
              onChange={(event) =>
                setEditForm({
                  ...editForm,
                  target_price: event.target.value,
                })
              }
              placeholder="Optional"
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <label className="mb-2 block text-sm text-gray-400">
              Desired Quantity
            </label>
            <input
              type="number"
              min="1"
              value={editForm.desired_quantity}
              onChange={(event) =>
                setEditForm({
                  ...editForm,
                  desired_quantity: Number(event.target.value),
                })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <label className="mb-2 block text-sm text-gray-400">Notes</label>
            <textarea
              value={editForm.notes}
              onChange={(event) =>
                setEditForm({ ...editForm, notes: event.target.value })
              }
              placeholder="Optional notes"
              className="mb-4 h-24 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <button
              onClick={() =>
                setEditForm({
                  ...editForm,
                  notifications_enabled: !editForm.notifications_enabled,
                })
              }
              className={`mb-5 flex w-full items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold ${
                editForm.notifications_enabled
                  ? 'border-green-900 bg-green-950/40 text-green-300'
                  : 'border-[#333] bg-black text-gray-500'
              }`}
            >
              {editForm.notifications_enabled ? (
                <Bell size={17} />
              ) : (
                <BellOff size={17} />
              )}
              Match notifications{' '}
              {editForm.notifications_enabled ? 'enabled' : 'disabled'}
            </button>

            <button
              onClick={saveEdit}
              disabled={!!actionLoading}
              className="w-full rounded-xl bg-white p-4 font-semibold text-black disabled:opacity-60"
            >
              {actionLoading === 'Updating wishlist item...'
                ? 'Saving...'
                : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5">
          <div className="w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold">Delete from wishlist?</h3>
              <button onClick={() => setDeleteConfirm(null)}>
                <X size={22} />
              </button>
            </div>

            <p className="mb-5 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm font-semibold text-red-300">
              {deleteConfirm.message}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-xl border border-[#222] bg-black p-4 text-sm font-bold text-gray-300"
              >
                No
              </button>

              <button
                onClick={performDelete}
                className="rounded-xl bg-red-500 p-4 text-sm font-bold text-white"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default WishlistTab