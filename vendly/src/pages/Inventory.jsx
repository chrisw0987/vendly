import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import {
  Package,
  Search as SearchIcon,
  Trash2,
  Pencil,
  Plus,
  Minus,
  CalendarDays,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

function Inventory() {
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [lists, setLists] = useState([])
  const [selectedListId, setSelectedListId] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [actionLoading, setActionLoading] = useState('')
  const [inventorySearch, setInventorySearch] = useState('')
  const [inventoryFilter, setInventoryFilter] = useState('all')
  const [events, setEvents] = useState([])
  const [showAssignments, setShowAssignments] = useState([])
  const [assigningItem, setAssigningItem] = useState(null)
  const [selectedItemIds, setSelectedItemIds] = useState([])
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [accountType, setAccountType] = useState('user')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const isVendor = accountType === 'vendor' || accountType === 'admin'

  const [editingItem, setEditingItem] = useState(null)
  const [editForm, setEditForm] = useState({
    quantity: 1,
    condition: 'NM',
    purchase_price: '',
    listing_price: '',
    physical_location: '',
    is_public: false,
    item_type: 'raw',
    grade_company: 'PSA',
    grade: '10',
    collection_status: 'found',
  })

  const [sellingItem, setSellingItem] = useState(null)
  const [saleForm, setSaleForm] = useState({
    sale_type: 'cash',
    sale_quantity: 1,
    cash_received: '',
    trade_value: '',
    notes: '',
  })

  useEffect(() => {
    setupInventory()
  }, [])

  useEffect(() => {
    if (selectedListId) {
      fetchInventory(selectedListId)
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

  async function fetchAccountType(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      setMessage(error.message)
      return 'user'
    }

    return data?.account_type || 'user'
  }

  async function setupInventory() {
    setLoading(true)
    setMessage('')

    const user = await getUserOrRedirect()
    if (!user) return

    const type = await fetchAccountType(user.id)
    setAccountType(type)
    const userIsVendor = type === 'vendor' || type === 'admin'

    const { data: existingLists, error } = await supabase
      .from('inventory_lists')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    if (!existingLists || existingLists.length === 0) {
      const { data: newList, error: createError } = await supabase
        .from('inventory_lists')
        .insert({
          owner_id: user.id,
          name: userIsVendor ? 'Main Inventory' : 'Main Collection',
        })
        .select()
        .single()

      if (createError) {
        setMessage(createError.message)
        setLoading(false)
        return
      }

      await supabase
        .from('inventory_items')
        .update({ inventory_list_id: newList.id })
        .eq('owner_id', user.id)
        .is('inventory_list_id', null)

      setLists([newList])
      setSelectedListId(newList.id)
    } else {
      const firstList = existingLists[0]

      await supabase
        .from('inventory_items')
        .update({ inventory_list_id: firstList.id })
        .eq('owner_id', user.id)
        .is('inventory_list_id', null)

      setLists(existingLists)
      setSelectedListId(firstList.id)
    }

    if (userIsVendor) {
      await fetchShowAssignmentData()
    } else {
      setEvents([])
      setShowAssignments([])
    }

    setLoading(false)
  }

  async function fetchInventory(listId) {
    setLoading(true)
    setMessage('')

    const user = await getUserOrRedirect()
    if (!user) return

    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('owner_id', user.id)
      .eq('inventory_list_id', listId)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      setItems([])
    } else {
      setItems(data || [])
    }

    setLoading(false)
  }


  async function fetchShowAssignmentData() {
    const user = await getUserOrRedirect()
    if (!user) return

    const { data: vendorShowData, error: vendorShowError } = await supabase
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

    if (vendorShowError) {
      setMessage(vendorShowError.message)
      return
    }

    const { data: assignmentData, error: assignmentError } = await supabase
      .from('show_inventory')
      .select('*')
      .eq('vendor_id', user.id)

    if (assignmentError) {
      setMessage(assignmentError.message)
      return
    }

    const vendorShows =
      vendorShowData
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

    setEvents(vendorShows)
    setShowAssignments(assignmentData || [])
  }

  function openAssignToShowModal(item) {
    if (!isVendor) return
    setAssigningItem(item)
  }

  function getAssignmentCount(itemId) {
    const activeEventIds = new Set(events.map((event) => event.id))

    return showAssignments.filter(
      (assignment) =>
        assignment.inventory_item_id === itemId &&
        activeEventIds.has(assignment.event_id)
    ).length
  }

  function isAssignedToEvent(itemId, eventId) {
    return showAssignments.some(
      (assignment) =>
        assignment.inventory_item_id === itemId && assignment.event_id === eventId
    )
  }

  async function toggleShowAssignment(event) {
    if (!assigningItem) return

    const user = await getUserOrRedirect()
    if (!user) return

    const existingAssignment = showAssignments.find(
      (assignment) =>
        assignment.inventory_item_id === assigningItem.id &&
        assignment.event_id === event.id
    )

    if (existingAssignment) {
      const { error } = await supabase
        .from('show_inventory')
        .delete()
        .eq('id', existingAssignment.id)

      if (error) {
        setMessage(error.message)
        return
      }

      setShowAssignments((current) =>
        current.filter((assignment) => assignment.id !== existingAssignment.id)
      )
      return
    }

    const { data, error } = await supabase
      .from('show_inventory')
      .insert({
        vendor_id: user.id,
        inventory_item_id: assigningItem.id,
        event_id: event.id,
      })
      .select()
      .single()

    if (error) {
      setMessage(error.message)
      return
    }

    setShowAssignments((current) => [...current, data])
  }

  function formatEventDate(date) {
    if (!date) return 'Date TBD'

    return new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function openSoldModal(item) {
    if (!isVendor) return

    const itemQuantity = Number(item.quantity || 1)

    setSellingItem(item)
    setSaleForm({
      sale_type: 'cash',
      sale_quantity: 1,
      cash_received: item.listing_price ? String(item.listing_price) : '',
      trade_value: '',
      notes: itemQuantity > 1 ? `Selling 1 of ${itemQuantity}` : '',
    })
  }

  async function saveSale() {
    if (!sellingItem) return

    const user = await getUserOrRedirect()
    if (!user) return

    const currentQuantity = Number(sellingItem.quantity || 1)
    const saleQuantity = Math.max(1, Number(saleForm.sale_quantity || 1))

    if (saleQuantity > currentQuantity) {
      setMessage(`You only have ${currentQuantity} available.`)
      return
    }

    const cash = Number(saleForm.cash_received || 0)
    const trade = Number(saleForm.trade_value || 0)
    const total = cash + trade
    const purchasePrice = Number(sellingItem.purchase_price || 0)
    const totalPurchaseCost = purchasePrice * saleQuantity
    const profit = total - totalPurchaseCost
    const remainingQuantity = currentQuantity - saleQuantity
    const soldOut = remainingQuantity <= 0

    const { error: saleError } = await supabase
      .from('inventory_sales')
      .insert({
        inventory_item_id: sellingItem.id,
        vendor_id: user.id,
        sale_type: saleForm.sale_type,
        sale_quantity: saleQuantity,
        cash_received: cash,
        trade_value: trade,
        total_sale_value: total,
        purchase_price_snapshot: purchasePrice,
        profit,
        notes: saleForm.notes || null,
      })

    if (saleError) {
      setMessage(saleError.message)
      return
    }

    const itemUpdates = soldOut
      ? {
          quantity: 0,
          is_sold: true,
          is_public: false,
        }
      : {
          quantity: remainingQuantity,
          is_sold: false,
        }

    const { error: itemError } = await supabase
      .from('inventory_items')
      .update(itemUpdates)
      .eq('id', sellingItem.id)

    if (itemError) {
      setMessage(itemError.message)
      return
    }

    if (soldOut) {
      await supabase
        .from('show_inventory')
        .delete()
        .eq('inventory_item_id', sellingItem.id)

      setShowAssignments((current) =>
        current.filter(
          (assignment) => assignment.inventory_item_id !== sellingItem.id
        )
      )
    }

    setItems((current) =>
      current.map((item) =>
        item.id === sellingItem.id ? { ...item, ...itemUpdates } : item
      )
    )

    setSellingItem(null)
    setMessage(
      soldOut
        ? 'Sale recorded. Item is sold out.'
        : `Sale recorded. ${remainingQuantity} remaining.`
    )
  }

  async function createInventoryList() {
    const name = window.prompt('Name your new inventory list:')

    if (!name || !name.trim()) return

    const user = await getUserOrRedirect()
    if (!user) return

    setActionLoading('Creating inventory list...')
    setMessage('')

    const { data, error } = await supabase
      .from('inventory_lists')
      .insert({
        owner_id: user.id,
        name: name.trim(),
      })
      .select()
      .single()

    setActionLoading('')

    if (error) {
      setMessage(error.message)
      return
    }

    setLists((current) => [...current, data])
    setSelectedListId(data.id)
    setItems([])
    setSelectedItemIds([])
    setMessage('Inventory list created.')
  }

  async function renameSelectedList() {
    const selectedList = lists.find((list) => list.id === selectedListId)

    if (!selectedList) return

    const nextName = window.prompt('Rename this inventory list:', selectedList.name)

    if (!nextName || !nextName.trim()) return

    const cleanName = nextName.trim()

    setActionLoading('Renaming inventory list...')
    setMessage('')

    const { error } = await supabase
      .from('inventory_lists')
      .update({ name: cleanName })
      .eq('id', selectedList.id)

    setActionLoading('')

    if (error) {
      setMessage(error.message)
      return
    }

    setLists((current) =>
      current.map((list) =>
        list.id === selectedList.id ? { ...list, name: cleanName } : list
      )
    )
    setMessage('Inventory list renamed.')
  }

  async function deleteSelectedList() {
    const selectedList = lists.find((list) => list.id === selectedListId)

    if (!selectedList) return

    const confirmed = window.confirm(
      `Are you sure you want to delete this list? This will also delete the cards inside ${selectedList.name}.`
    )

    if (!confirmed) return

    const user = await getUserOrRedirect()
    if (!user) return

    setActionLoading('Deleting inventory list...')
    setMessage('')

    if (items.length > 0) {
      const { error: assignmentError } = await supabase
        .from('show_inventory')
        .delete()
        .in('inventory_item_id', items.map((item) => item.id))

      if (assignmentError) {
        setActionLoading('')
        setMessage(assignmentError.message)
        return
      }
    }

    const { error: itemError } = await supabase
      .from('inventory_items')
      .delete()
      .eq('owner_id', user.id)
      .eq('inventory_list_id', selectedList.id)

    if (itemError) {
      setActionLoading('')
      setMessage(itemError.message)
      return
    }

    const { error: listError } = await supabase
      .from('inventory_lists')
      .delete()
      .eq('id', selectedList.id)
      .eq('owner_id', user.id)

    if (listError) {
      setActionLoading('')
      setMessage(listError.message)
      return
    }

    const remainingLists = lists.filter((list) => list.id !== selectedList.id)

    if (remainingLists.length > 0) {
      setActionLoading('')
      setLists(remainingLists)
      setSelectedListId(remainingLists[0].id)
      setSelectedItemIds([])
      setMessage('Inventory list deleted.')
      return
    }

    const { data: newList, error: createError } = await supabase
      .from('inventory_lists')
      .insert({
        owner_id: user.id,
        name: isVendor ? 'Main Inventory' : 'Main Collection',
      })
      .select()
      .single()

    setActionLoading('')

    if (createError) {
      setMessage(createError.message)
      setLists([])
      setSelectedListId('')
      setItems([])
      return
    }

    setLists([newList])
    setSelectedListId(newList.id)
    setItems([])
    setSelectedItemIds([])
    setMessage('Inventory list deleted. A new empty list was created.')
  }

  function requestDeleteItem(item) {
    if (!item || actionLoading) return

    setDeleteConfirm({
      type: 'single',
      itemIds: [item.id],
      title: 'Delete item?',
      message: `Are you sure you want to delete ${item.card_name || 'this item'}?`,
    })
  }

  function requestBulkDeleteSelected() {
    if (selectedItemIds.length === 0 || actionLoading) return

    setDeleteConfirm({
      type: 'bulk',
      itemIds: selectedItemIds,
      title: 'Delete selected items?',
      message: `Are you sure you want to delete ${selectedItemIds.length} item${selectedItemIds.length === 1 ? '' : 's'}?`,
    })
  }

  async function performDeleteItems() {
    if (!deleteConfirm?.itemIds?.length || actionLoading) return

    const itemIdsToDelete = deleteConfirm.itemIds

    setDeleteConfirm(null)
    setActionLoading(
      itemIdsToDelete.length === 1
        ? 'Deleting item...'
        : 'Deleting selected items...'
    )
    setMessage('')

    const { error: assignmentError } = await supabase
      .from('show_inventory')
      .delete()
      .in('inventory_item_id', itemIdsToDelete)

    if (assignmentError) {
      setActionLoading('')
      setMessage(assignmentError.message)
      return
    }

    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .in('id', itemIdsToDelete)

    setActionLoading('')

    if (error) {
      setMessage(error.message)
      return
    }

    setItems((current) =>
      current.filter((item) => !itemIdsToDelete.includes(item.id))
    )
    setShowAssignments((current) =>
      current.filter(
        (assignment) => !itemIdsToDelete.includes(assignment.inventory_item_id)
      )
    )
    setSelectedItemIds((current) =>
      current.filter((id) => !itemIdsToDelete.includes(id))
    )
    setMessage(
      itemIdsToDelete.length === 1
        ? 'Item deleted.'
        : 'Selected items deleted.'
    )
  }

  async function updateItemField(item, field, value) {
    const { error } = await supabase
      .from('inventory_items')
      .update({ [field]: value })
      .eq('id', item.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setItems((current) =>
      current.map((i) => (i.id === item.id ? { ...i, [field]: value } : i))
    )
  }

  async function adjustQuantity(item, amount) {
    const currentQuantity = Number(item.quantity || 1)
    const nextQuantity = Math.max(1, currentQuantity + amount)

    if (nextQuantity === currentQuantity) return

    const updates = {
      quantity: nextQuantity,
      is_sold: false,
    }

    const { error } = await supabase
      .from('inventory_items')
      .update(updates)
      .eq('id', item.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setItems((current) =>
      current.map((i) => (i.id === item.id ? { ...i, ...updates } : i))
    )
  }

  function openEditModal(item) {
    setEditingItem(item)

    setEditForm({
      quantity: item.quantity || 1,
      condition: item.condition || 'NM',
      purchase_price:
        item.purchase_price !== null && item.purchase_price !== undefined
          ? String(item.purchase_price)
          : '',
      listing_price:
        item.listing_price !== null && item.listing_price !== undefined
          ? String(item.listing_price)
          : '',
      physical_location: item.physical_location || '',
      is_public: item.is_public || false,
      item_type: item.item_type || 'raw',
      grade_company: item.grade_company || 'PSA',
      grade: item.grade || '10',
      collection_status: item.collection_status === 'hunting' ? 'hunting' : 'found',
    })
  }

  async function saveEdit() {
    if (!editingItem || actionLoading) return

    if (!isVendor) {
      setActionLoading('Updating collection category...')
      setMessage('')

      const updates = {
        collection_status: editForm.collection_status,
        is_public: false,
      }

      const { error } = await supabase
        .from('inventory_items')
        .update(updates)
        .eq('id', editingItem.id)

      setActionLoading('')

      if (error) {
        setMessage(error.message)
        return
      }

      setItems((current) =>
        current.map((item) =>
          item.id === editingItem.id ? { ...item, ...updates } : item
        )
      )

      setEditingItem(null)
      setMessage('Collection category updated.')
      return
    }

    const editedQuantity = Math.max(0, Number(editForm.quantity || 0))
    const soldOut = editedQuantity <= 0

    const updates = {
      quantity: editedQuantity,
      condition: editForm.item_type === 'raw' ? editForm.condition : null,
      purchase_price:
        editForm.purchase_price === '' ? null : Number(editForm.purchase_price),
      listing_price:
        editForm.listing_price === '' ? null : Number(editForm.listing_price),
      physical_location: editForm.physical_location || null,
      is_public: isVendor ? (soldOut ? false : editForm.is_public) : false,
      is_sold: soldOut,
      grade_company:
        editForm.item_type === 'graded' ? editForm.grade_company : null,
      grade: editForm.item_type === 'graded' ? editForm.grade : null,
    }

    const { error } = await supabase
      .from('inventory_items')
      .update(updates)
      .eq('id', editingItem.id)

    if (error) {
      setMessage(error.message)
      return
    }

    if (soldOut) {
      await supabase
        .from('show_inventory')
        .delete()
        .eq('inventory_item_id', editingItem.id)

      setShowAssignments((current) =>
        current.filter(
          (assignment) => assignment.inventory_item_id !== editingItem.id
        )
      )
    }

    setItems((current) =>
      current.map((item) =>
        item.id === editingItem.id ? { ...item, ...updates } : item
      )
    )

    setEditingItem(null)
    setMessage('Inventory item updated.')
  }

  function getToneClasses(tone) {
    switch (tone) {
      case 'green':
        return 'bg-green-500 text-black'
      case 'red':
        return 'bg-red-500 text-white'
      case 'yellow':
        return 'bg-yellow-300 text-black'
      default:
        return 'bg-white text-black'
    }
  }

  function ToggleButton({
    active,
    onClick,
    leftLabel,
    rightLabel,
    leftTone = 'red',
    rightTone = 'green',
  }) {
    return (
      <button
        onClick={onClick}
        className="relative flex w-full items-center rounded-full border border-[#262626] bg-black p-1 text-xs font-bold transition hover:border-[#3a3a3a]"
      >
        <span
          className={`w-1/2 rounded-full py-2 text-center transition ${
            !active ? getToneClasses(leftTone) : 'text-gray-500'
          }`}
        >
          {leftLabel}
        </span>

        <span
          className={`w-1/2 rounded-full py-2 text-center transition ${
            active ? getToneClasses(rightTone) : 'text-gray-500'
          }`}
        >
          {rightLabel}
        </span>
      </button>
    )
  }

  function matchesInventorySearch(item) {
    const query = inventorySearch.trim().toLowerCase()

    if (!query) return true

    const searchableText = [
      item.card_name,
      item.set_name,
      item.card_number,
      item.rarity,
      item.condition,
      item.grade_company,
      item.grade,
      item.physical_location,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return searchableText.includes(query)
  }

  function getUserCollectionStatus(item) {
    return item.collection_status === 'hunting' ? 'hunting' : 'found'
  }

  function matchesInventoryFilter(item) {
    if (!isVendor) {
      switch (inventoryFilter) {
        case 'hunting':
          return getUserCollectionStatus(item) === 'hunting'
        case 'found':
          return getUserCollectionStatus(item) === 'found'
        default:
          return true
      }
    }

    switch (inventoryFilter) {
      case 'available':
        return !item.is_sold
      case 'sold':
        return item.is_sold
      case 'public':
        return item.is_public
      case 'private':
        return !item.is_public
      default:
        return true
    }
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === '') return null
    return `$${Number(value).toFixed(2)}`
  }

  function getTcgPlayerSearchUrl(item) {
    const query = [item.card_name, item.set_name].filter(Boolean).join(' ')
    return `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(query)}&view=grid`
  }

  function isSelected(itemId) {
    return selectedItemIds.includes(itemId)
  }

  function toggleSelectedItem(itemId) {
    setSelectedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    )
  }

  function selectAllShown() {
    setSelectedItemIds(filteredItems.map((item) => item.id))
  }

  function clearSelection() {
    setSelectedItemIds([])
  }

  function getSelectedItems() {
    return items.filter((item) => selectedItemIds.includes(item.id))
  }

  async function bulkUpdateVisibility(isPublic) {
    if (selectedItemIds.length === 0 || actionLoading) return

    setActionLoading(isPublic ? 'Marking selected items public...' : 'Marking selected items private...')
    setMessage('')

    const { error } = await supabase
      .from('inventory_items')
      .update({ is_public: isPublic })
      .in('id', selectedItemIds)

    setActionLoading('')

    if (error) {
      setMessage(error.message)
      return
    }

    setItems((current) =>
      current.map((item) =>
        selectedItemIds.includes(item.id) ? { ...item, is_public: isPublic } : item
      )
    )

    setMessage(isPublic ? 'Selected items marked public.' : 'Selected items marked private.')
  }


  async function bulkAssignToShow(event) {
    if (selectedItemIds.length === 0 || actionLoading) return

    const user = await getUserOrRedirect()
    if (!user) return

    const existingPairs = new Set(
      showAssignments.map(
        (assignment) => `${assignment.inventory_item_id}-${assignment.event_id}`
      )
    )

    const assignments = selectedItemIds
      .filter((itemId) => !existingPairs.has(`${itemId}-${event.id}`))
      .map((itemId) => ({
        vendor_id: user.id,
        inventory_item_id: itemId,
        event_id: event.id,
      }))

    if (assignments.length === 0) {
      setMessage('Selected items are already assigned to this show.')
      return
    }

    setActionLoading(`Assigning selected items to ${event.name}...`)
    setMessage('')

    const { data, error } = await supabase
      .from('show_inventory')
      .insert(assignments)
      .select()

    setActionLoading('')

    if (error) {
      setMessage(error.message)
      return
    }

    setShowAssignments((current) => [...current, ...(data || [])])
    setBulkAssigning(false)
    setSelectedItemIds([])
    setMessage(`Assigned ${assignments.length} item${assignments.length === 1 ? '' : 's'} to ${event.name}.`)
  }

  async function bulkRemoveFromShow(event) {
    if (selectedItemIds.length === 0 || actionLoading) return

    const matchingAssignments = showAssignments.filter(
      (assignment) =>
        selectedItemIds.includes(assignment.inventory_item_id) &&
        assignment.event_id === event.id
    )

    if (matchingAssignments.length === 0) {
      setMessage('Selected items are not assigned to this show.')
      return
    }

    const assignmentIds = matchingAssignments.map((assignment) => assignment.id)

    setActionLoading(`Removing selected items from ${event.name}...`)
    setMessage('')

    const { error } = await supabase
      .from('show_inventory')
      .delete()
      .in('id', assignmentIds)

    setActionLoading('')

    if (error) {
      setMessage(error.message)
      return
    }

    setShowAssignments((current) =>
      current.filter((assignment) => !assignmentIds.includes(assignment.id))
    )
    setBulkAssigning(false)
    setMessage(`Removed selected items from ${event.name}.`)
  }

  const selectedCount = selectedItemIds.length

  const selectedList = lists.find((list) => list.id === selectedListId)
  const filteredItems = items.filter(
    (item) => matchesInventorySearch(item) && matchesInventoryFilter(item)
  )

  const filterOptions = isVendor
    ? [
        { value: 'all', label: 'All', count: items.length },
        {
          value: 'available',
          label: 'Available',
          count: items.filter((item) => !item.is_sold).length,
        },
        {
          value: 'sold',
          label: 'Sold Out',
          count: items.filter((item) => item.is_sold).length,
        },
        {
          value: 'public',
          label: 'Public',
          count: items.filter((item) => item.is_public).length,
        },
        {
          value: 'private',
          label: 'Private',
          count: items.filter((item) => !item.is_public).length,
        },
      ]
    : [
        { value: 'all', label: 'All', count: items.length },
        {
          value: 'hunting',
          label: 'Hunting',
          count: items.filter((item) => getUserCollectionStatus(item) === 'hunting').length,
        },
        {
          value: 'found',
          label: 'Found',
          count: items.filter((item) => getUserCollectionStatus(item) === 'found').length,
        },
      ]

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <main className="mx-auto max-w-[430px] px-5 pt-8">
        <div className="mb-6 text-center">
          <div className="mb-4 flex items-center justify-center gap-2">
            <select
              value={selectedListId}
              onChange={(e) => {
                setSelectedListId(e.target.value)
                setSelectedItemIds([])
              }}
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
              className="rounded-xl border border-[#222] bg-[#111] p-3 text-white disabled:opacity-40"
              aria-label="Rename inventory list"
            >
              <Pencil size={18} />
            </button>

            <button
              onClick={deleteSelectedList}
              disabled={!selectedListId || !!actionLoading}
              className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-red-300 disabled:opacity-40"
              aria-label="Delete inventory list"
            >
              <Trash2 size={18} />
            </button>

            <button
              onClick={createInventoryList}
              disabled={!!actionLoading}
              className="rounded-xl border border-[#222] bg-[#111] p-3 text-white"
              aria-label="Create inventory list"
            >
              <Plus size={18} />
            </button>
          </div>

          <h1 className="text-3xl font-bold">{isVendor ? 'Inventory' : 'My Collection'}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {selectedList?.name || (isVendor ? 'Manage your saved cards and listings.' : 'Track your collection, wishlist, and card hunt.')}
          </p>
        </div>

        {message && (
          <p
            className={`mb-4 rounded-xl border p-3 text-sm font-bold ${
              message.toLowerCase().includes('updated') ||
              message.toLowerCase().includes('created') ||
              message.toLowerCase().includes('renamed') ||
              message.toLowerCase().includes('added') ||
              message.toLowerCase().includes('merged') ||
              message.toLowerCase().includes('saved') ||
              message.toLowerCase().includes('recorded') ||
              message.toLowerCase().includes('assigned') ||
              message.toLowerCase().includes('removed') ||
              message.toLowerCase().includes('deleted') ||
              message.toLowerCase().includes('marked') ||
              message.toLowerCase().includes('category')
                ? 'border-green-900 bg-green-950/40 text-green-300'
                : 'border-red-900 bg-red-950/40 text-red-300'
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

        {loading && <p className="text-sm text-gray-400">Loading inventory...</p>}

        {!loading && items.length > 0 && (
          <div className="mb-5 space-y-3">
            <div className="flex items-center rounded-2xl border border-[#222] bg-[#111] px-4">
              <SearchIcon size={18} className="text-gray-500" />

              <input
                placeholder={isVendor ? "Search inventory, location, grade..." : "Search collection, storage, grade..."}
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className="w-full bg-transparent p-4 text-white outline-none"
              />

              {inventorySearch && (
                <button
                  onClick={() => setInventorySearch('')}
                  className="text-gray-500 hover:text-white"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setInventoryFilter(option.value)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
                    inventoryFilter === option.value
                      ? 'border-white bg-white text-black'
                      : 'border-[#222] bg-[#111] text-gray-400'
                  }`}
                >
                  {option.label} {option.count}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={selectAllShown}
                disabled={filteredItems.length === 0 || !!actionLoading}
                className="rounded-xl border border-[#222] bg-[#111] px-4 py-3 text-xs font-semibold text-gray-300 disabled:opacity-40"
              >
                Select all shown
              </button>

              {selectedCount > 0 && (
                <>
                  <button
                    onClick={clearSelection}
                    disabled={!!actionLoading}
                    className="rounded-xl border border-[#222] bg-[#111] px-4 py-3 text-xs font-semibold text-gray-300"
                  >
                    Clear {selectedCount}
                  </button>

                  {isVendor && (
                    <>
                      <button
                        onClick={() => bulkUpdateVisibility(true)}
                        disabled={!!actionLoading}
                        className="rounded-xl bg-green-500 px-4 py-3 text-xs font-bold text-black"
                      >
                        {actionLoading === 'Marking selected items public...' ? 'Updating...' : 'Mark Public'}
                      </button>

                      <button
                        onClick={() => bulkUpdateVisibility(false)}
                        disabled={!!actionLoading}
                        className="rounded-xl bg-red-500 px-4 py-3 text-xs font-bold text-white"
                      >
                        {actionLoading === 'Marking selected items private...' ? 'Updating...' : 'Mark Private'}
                      </button>

                      <button
                        onClick={() => setBulkAssigning(true)}
                        disabled={!!actionLoading}
                        className="rounded-xl border border-blue-900 bg-blue-950/40 px-4 py-3 text-xs font-bold text-blue-300"
                      >
                        Assign to Show
                      </button>
                    </>
                  )}

                  <button
                    onClick={requestBulkDeleteSelected}
                    disabled={!!actionLoading}
                    className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-xs font-bold text-red-300"
                  >
                    {actionLoading === 'Deleting selected items...' ? 'Deleting...' : 'Delete Selected'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="rounded-2xl border border-[#222] bg-[#111] p-6 text-center">
            <Package className="mx-auto mb-3 text-gray-500" size={36} />
            <h2 className="text-lg font-semibold">No cards yet</h2>
            <p className="mt-1 text-sm text-gray-400">
              {isVendor ? 'Cards you add from Search will appear here.' : 'Cards you track from Search will appear here.'}
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
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Your Cards</h2>
              <p className="text-sm text-gray-500">{filteredItems.length} shown</p>
            </div>

            {filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-[#222] bg-[#111] p-6 text-center">
                <Package className="mx-auto mb-3 text-gray-500" size={36} />
                <h2 className="text-lg font-semibold">No matching cards</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Try changing your search or filter.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-3xl border bg-[#111] p-4 shadow-lg shadow-black/20 ${
                      isSelected(item.id) ? 'border-blue-700' : 'border-[#222]'
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                        <input
                          type="checkbox"
                          checked={isSelected(item.id)}
                          onChange={() => toggleSelectedItem(item.id)}
                          className="h-4 w-4 accent-blue-500"
                        />
                        Select
                      </label>

                      {isSelected(item.id) && (
                        <span className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-xs font-bold text-blue-300">
                          Selected
                        </span>
                      )}
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

                            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                              {isVendor && (
                                <span
                                  className={`rounded-full px-2.5 py-1 ${
                                    item.is_sold
                                      ? 'bg-red-500 text-white'
                                      : 'bg-green-500 text-black'
                                  }`}
                                >
                                  {item.is_sold ? 'Sold Out' : 'Available'}
                                </span>
                              )}

                              {isVendor && (
                                <span className="rounded-full border border-[#2a2a2a] bg-black px-2.5 py-1 text-gray-300">
                                  Qty {item.quantity || 0}
                                </span>
                              )}

                              <span className="rounded-full border border-[#2a2a2a] bg-black px-2.5 py-1 text-gray-300">
                                {item.item_type === 'graded'
                                  ? `${item.grade_company || 'Graded'} ${item.grade || ''}`
                                  : item.condition || 'Condition N/A'}
                              </span>

                              {!isVendor && (
                                <span className={`rounded-full px-2.5 py-1 ${
                                  getUserCollectionStatus(item) === 'hunting'
                                    ? 'bg-blue-950/40 text-blue-300 border border-blue-900'
                                    : 'bg-green-950/40 text-green-300 border border-green-900'
                                }`}>
                                  {getUserCollectionStatus(item) === 'hunting' ? 'Hunting' : 'Found'}
                                </span>
                              )}

                              {isVendor && getAssignmentCount(item.id) > 0 && (
                                <span className="rounded-full border border-blue-900 bg-blue-950/40 px-2.5 py-1 text-blue-300">
                                  {getAssignmentCount(item.id)} Show{getAssignmentCount(item.id) === 1 ? '' : 's'}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 gap-1">
                            <button
                              onClick={() => openEditModal(item)}
                              className="rounded-xl p-2 text-gray-500 hover:bg-[#1a1a1a] hover:text-white"
                              aria-label="Edit item"
                            >
                              <Pencil size={18} />
                            </button>

                            <button
                              onClick={() => requestDeleteItem(item)}
                              className="rounded-xl p-2 text-gray-500 hover:bg-[#1a1a1a] hover:text-red-400"
                              aria-label="Delete item"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                          {isVendor && (
                            <div className="rounded-2xl border border-yellow-900/60 bg-yellow-950/20 p-3">
                              <p className="text-xs text-gray-400">Listed</p>
                              <p className="font-bold text-yellow-300">
                                {formatMoney(item.listing_price) || 'No listing price'}
                              </p>
                            </div>
                          )}

                          <div className={isVendor ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
                            {isVendor && (
                              <div className="rounded-2xl border border-[#222] bg-black p-3">
                                <p className="text-xs text-gray-500">Bought</p>
                                <p className="font-semibold text-gray-300">
                                  {formatMoney(item.purchase_price) || 'Not set'}
                                </p>
                              </div>
                            )}

                            <div className="rounded-2xl border border-[#222] bg-black p-3">
                              <p className="text-xs text-gray-500">Market</p>
                              <p className="font-semibold text-gray-300">
                                {formatMoney(item.market_price) || 'N/A'}
                              </p>

                                <p className="mt-2 text-xs text-gray-500">
                                  Double check market on TCG Player{' '}
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
                        </div>
                      </div>
                    </div>

                    {isVendor && item.physical_location && (
                      <p className="mt-3 rounded-2xl border border-[#222] bg-black px-3 py-2 text-sm text-gray-400">
                        Location: {item.physical_location}
                      </p>
                    )}

                    {isVendor && !item.is_sold ? (
                      <>
                        <div className="mt-4 grid grid-cols-[44px_44px_1fr] gap-2">
                          <button
                            onClick={() => adjustQuantity(item, -1)}
                            disabled={Number(item.quantity || 1) <= 1}
                            className="flex h-11 items-center justify-center rounded-xl border border-[#222] bg-black text-gray-300 disabled:opacity-40"
                            aria-label="Decrease quantity"
                          >
                            <Minus size={17} />
                          </button>

                          <button
                            onClick={() => adjustQuantity(item, 1)}
                            className="flex h-11 items-center justify-center rounded-xl border border-[#222] bg-black text-gray-300"
                            aria-label="Increase quantity"
                          >
                            <Plus size={17} />
                          </button>

                          <button
                            onClick={() => openSoldModal(item)}
                            className="flex h-11 items-center justify-center rounded-xl bg-white text-sm font-bold text-black"
                          >
                            Sell
                          </button>
                        </div>

                        <button
                          onClick={() => openAssignToShowModal(item)}
                          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-900 bg-blue-950/30 text-sm font-bold text-blue-300"
                        >
                          <CalendarDays size={17} />
                          Assign to Show
                          {getAssignmentCount(item.id) > 0
                            ? ` (${getAssignmentCount(item.id)})`
                            : ''}
                        </button>

                        <div className="mt-3">
                          <ToggleButton
                            active={item.is_public}
                            onClick={() =>
                              updateItemField(item, 'is_public', !item.is_public)
                            }
                            leftLabel="Private"
                            rightLabel="Public"
                            leftTone="red"
                            rightTone="green"
                          />
                        </div>
                      </>
                    ) : isVendor && item.is_sold ? (
                      <div className="mt-4 rounded-2xl border border-red-900 bg-red-950/30 p-3 text-center text-sm font-bold text-red-300">
                        Sold Out
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>


      {isVendor && bulkAssigning && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-5">
          <div className="mx-auto mt-8 w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Bulk Assign to Show</h2>

              <button onClick={() => setBulkAssigning(false)}>
                <X size={22} />
              </button>
            </div>

            <p className="mb-4 rounded-xl border border-blue-900 bg-blue-950/30 p-3 text-sm font-bold text-blue-300">
              {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
            </p>

            {events.length === 0 ? (
              <div className="rounded-2xl border border-[#222] bg-black p-5 text-center">
                <p className="text-sm text-gray-400">
                  No vendor shows found. Join a show from the Shows page first.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-2xl border border-[#222] bg-black p-4"
                  >
                    <p className="font-semibold">{event.name}</p>
                    <p className="mt-1 text-sm text-gray-400">
                      {event.venue || 'Venue TBD'}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {[event.city, event.state].filter(Boolean).join(', ')}
                    </p>
                    {event.booth_number && (
                      <p className="mt-1 text-sm font-semibold text-blue-300">
                        Booth {event.booth_number}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-gray-500">
                      {formatEventDate(event.starts_at)}
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => bulkAssignToShow(event)}
                        className="rounded-xl bg-blue-500 p-3 text-xs font-bold text-black"
                      >
                        Add Selected
                      </button>

                      <button
                        onClick={() => bulkRemoveFromShow(event)}
                        className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-xs font-bold text-red-300"
                      >
                        Remove Selected
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isVendor && assigningItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-5">
          <div className="mx-auto mt-8 w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Assign to Show</h2>

              <button onClick={() => setAssigningItem(null)}>
                <X size={22} />
              </button>
            </div>

            <div className="mb-5 flex gap-4">
              {assigningItem.image_url && (
                <img
                  src={assigningItem.image_url}
                  alt={assigningItem.card_name}
                  className="h-32 w-24 shrink-0 rounded-xl bg-black object-contain"
                />
              )}

              <div>
                <p className="font-medium">{assigningItem.card_name}</p>
                <p className="mt-1 text-sm text-gray-400">
                  {assigningItem.set_name || 'Set N/A'}
                  {assigningItem.card_number ? ` #${assigningItem.card_number}` : ''}
                </p>
                <p className="mt-2 text-sm text-blue-300">
                  Assigned to {getAssignmentCount(assigningItem.id)} show
                  {getAssignmentCount(assigningItem.id) === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            {events.length === 0 ? (
              <div className="rounded-2xl border border-[#222] bg-black p-5 text-center">
                <p className="text-sm text-gray-400">
                  No vendor shows found. Join a show from the Shows page first, then assign inventory to that show.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((event) => {
                  const assigned = isAssignedToEvent(assigningItem.id, event.id)

                  return (
                    <button
                      key={event.id}
                      onClick={() => toggleShowAssignment(event)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        assigned
                          ? 'border-blue-800 bg-blue-950/40'
                          : 'border-[#222] bg-black hover:border-[#444]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{event.name}</p>
                          <p className="mt-1 text-sm text-gray-400">
                            {event.venue || 'Venue TBD'}
                          </p>
                          <p className="mt-1 text-sm text-gray-500">
                            {[event.city, event.state].filter(Boolean).join(', ')}
                          </p>
                          {event.booth_number && (
                            <p className="mt-1 text-sm font-semibold text-blue-300">
                              Booth {event.booth_number}
                            </p>
                          )}
                          <p className="mt-1 text-sm text-gray-500">
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

            <button
              onClick={() => setAssigningItem(null)}
              className="mt-5 w-full rounded-xl bg-white p-4 font-semibold text-black"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-5">
          <div className="mx-auto mt-8 w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{isVendor ? 'Modify Item' : 'Modify Card'}</h2>

              <button onClick={() => setEditingItem(null)}>
                <X size={22} />
              </button>
            </div>

            <div className="mb-5 flex gap-4">
              {editingItem.image_url && (
                <img
                  src={editingItem.image_url}
                  alt={editingItem.card_name}
                  className="h-32 w-24 shrink-0 rounded-xl bg-black object-contain"
                />
              )}

              <div>
                <p className="font-medium">{editingItem.card_name}</p>
                <p className="mt-1 text-sm text-gray-400">
                  {editingItem.set_name || 'Set N/A'}
                  {editingItem.card_number ? ` #${editingItem.card_number}` : ''}
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  {editingItem.rarity || 'Rarity N/A'}
                </p>
              </div>
            </div>

            {!isVendor ? (
              <>
                <label className="mb-2 block text-sm text-gray-400">
                  Collection Category
                </label>
                <select
                  value={editForm.collection_status}
                  onChange={(e) =>
                    setEditForm({ ...editForm, collection_status: e.target.value })
                  }
                  className="mb-5 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                >
                  <option value="found">Found</option>
                  <option value="hunting">Hunting</option>
                </select>

                <p className="mb-5 rounded-xl border border-[#222] bg-black p-3 text-sm text-gray-400">
                  Use Hunting for cards you are still looking for. Use Found for cards already in your collection.
                </p>
              </>
            ) : (
              <>
            {editForm.item_type === 'raw' ? (
              <>
                <label className="mb-2 block text-sm text-gray-400">
                  Condition
                </label>
                <select
                  value={editForm.condition}
                  onChange={(e) =>
                    setEditForm({ ...editForm, condition: e.target.value })
                  }
                  className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                >
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
                  Grade Company
                </label>
                <select
                  value={editForm.grade_company}
                  onChange={(e) =>
                    setEditForm({ ...editForm, grade_company: e.target.value })
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

                <label className="mb-2 block text-sm text-gray-400">Grade</label>
                <select
                  value={editForm.grade}
                  onChange={(e) =>
                    setEditForm({ ...editForm, grade: e.target.value })
                  }
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
              </>
            )}

            <label className="mb-2 block text-sm text-gray-400">
              Purchase Price
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="What did you pay?"
              value={editForm.purchase_price}
              onChange={(e) =>
                setEditForm({ ...editForm, purchase_price: e.target.value })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <label className="mb-2 block text-sm text-gray-400">
              {isVendor ? 'Listing Price' : 'Target Value'}
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="Enter listing price"
              value={editForm.listing_price}
              onChange={(e) =>
                setEditForm({ ...editForm, listing_price: e.target.value })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <label className="mb-2 block text-sm text-gray-400">Quantity</label>
            <select
              value={editForm.quantity}
              onChange={(e) =>
                setEditForm({ ...editForm, quantity: Number(e.target.value) })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </select>

            <label className="mb-2 block text-sm text-gray-400">
              Physical Location
            </label>
            <input
              placeholder="Example: Binder 1, Row 2"
              value={editForm.physical_location}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  physical_location: e.target.value,
                })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            {isVendor && (
              <div className="mb-5">
                <ToggleButton
                  active={editForm.is_public}
                  onClick={() =>
                    setEditForm({
                      ...editForm,
                      is_public: !editForm.is_public,
                    })
                  }
                  leftLabel="Private"
                  rightLabel="Public"
                  leftTone="red"
                  rightTone="green"
                />
              </div>
            )}

              </>
            )}

            <button
              onClick={saveEdit}
              disabled={!!actionLoading}
              className="w-full rounded-xl bg-white p-4 font-semibold text-black disabled:opacity-60"
            >
              {actionLoading === 'Updating collection category...' ? 'Updating...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {isVendor && sellingItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-5">
          <div className="mx-auto mt-8 w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Record Sale</h2>

              <button onClick={() => setSellingItem(null)}>
                <X size={22} />
              </button>
            </div>

            <div className="mb-5 flex gap-4">
              {sellingItem.image_url && (
                <img
                  src={sellingItem.image_url}
                  alt={sellingItem.card_name}
                  className="h-32 w-24 shrink-0 rounded-xl bg-black object-contain"
                />
              )}

              <div>
                <p className="font-medium">{sellingItem.card_name}</p>
                <p className="mt-1 text-sm text-gray-400">
                  {sellingItem.set_name || 'Set N/A'}
                  {sellingItem.card_number ? ` #${sellingItem.card_number}` : ''}
                </p>
                <p className="mt-2 text-sm text-yellow-300">
                  Listed:{' '}
                  {formatMoney(sellingItem.listing_price) || 'No listing price'}
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  Available: {Number(sellingItem.quantity || 1)}
                </p>
              </div>
            </div>

            <label className="mb-2 block text-sm text-gray-400">Sale Type</label>
            <select
              value={saleForm.sale_type}
              onChange={(e) =>
                setSaleForm({ ...saleForm, sale_type: e.target.value })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            >
              <option value="cash">Cash</option>
              <option value="trade">Trade</option>
              <option value="cash_trade">Cash + Trade</option>
              <option value="other">Other</option>
            </select>

            <label className="mb-2 block text-sm text-gray-400">
              Quantity Sold
            </label>
            <select
              value={saleForm.sale_quantity}
              onChange={(e) =>
                setSaleForm({
                  ...saleForm,
                  sale_quantity: Number(e.target.value),
                })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            >
              {Array.from(
                { length: Number(sellingItem.quantity || 1) },
                (_, index) => index + 1
              ).map((num) => (
                <option key={num} value={num}>
                  {num} of {Number(sellingItem.quantity || 1)}
                </option>
              ))}
            </select>

            {(saleForm.sale_type === 'cash' ||
              saleForm.sale_type === 'cash_trade' ||
              saleForm.sale_type === 'other') && (
              <>
                <label className="mb-2 block text-sm text-gray-400">
                  Cash Received
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={saleForm.cash_received}
                  onChange={(e) =>
                    setSaleForm({
                      ...saleForm,
                      cash_received: e.target.value,
                    })
                  }
                  className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                />
              </>
            )}

            {(saleForm.sale_type === 'trade' ||
              saleForm.sale_type === 'cash_trade') && (
              <>
                <label className="mb-2 block text-sm text-gray-400">
                  Estimated Trade Value
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={saleForm.trade_value}
                  onChange={(e) =>
                    setSaleForm({ ...saleForm, trade_value: e.target.value })
                  }
                  className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                />
              </>
            )}

            <label className="mb-2 block text-sm text-gray-400">Notes</label>
            <textarea
              placeholder="Example: traded for Umbreon V + $20"
              value={saleForm.notes}
              onChange={(e) =>
                setSaleForm({ ...saleForm, notes: e.target.value })
              }
              className="mb-4 h-24 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <div className="mb-5 rounded-xl border border-[#222] bg-black p-4">
              <p className="text-sm text-gray-400">Sale Summary</p>

              <p className="mt-2 text-lg font-bold text-yellow-300">
                Total Value:{' '}
                {formatMoney(
                  Number(saleForm.cash_received || 0) +
                    Number(saleForm.trade_value || 0)
                )}
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Quantity Sold: {Number(saleForm.sale_quantity || 1)}
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Purchase Cost:{' '}
                {formatMoney(
                  Number(sellingItem.purchase_price || 0) *
                    Number(saleForm.sale_quantity || 1)
                )}
              </p>

              <p
                className={`mt-1 text-sm font-semibold ${
                  Number(saleForm.cash_received || 0) +
                    Number(saleForm.trade_value || 0) -
                    Number(sellingItem.purchase_price || 0) *
                      Number(saleForm.sale_quantity || 1) >=
                  0
                    ? 'text-green-300'
                    : 'text-red-300'
                }`}
              >
                Profit:{' '}
                {formatMoney(
                  Number(saleForm.cash_received || 0) +
                    Number(saleForm.trade_value || 0) -
                    Number(sellingItem.purchase_price || 0) *
                      Number(saleForm.sale_quantity || 1)
                )}
              </p>
            </div>

            <button
              onClick={saveSale}
              className="w-full rounded-xl bg-white p-4 font-semibold text-black"
            >
              Save Sale
            </button>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5">
          <div className="w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{deleteConfirm.title}</h2>

              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={!!actionLoading}
                className="text-gray-400 hover:text-white disabled:opacity-40"
              >
                <X size={22} />
              </button>
            </div>

            <p className="mb-5 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm font-semibold text-red-300">
              {deleteConfirm.message}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={!!actionLoading}
                className="rounded-xl border border-[#222] bg-black p-4 text-sm font-bold text-gray-300 disabled:opacity-40"
              >
                No
              </button>

              <button
                onClick={performDeleteItems}
                disabled={!!actionLoading}
                className="rounded-xl bg-red-500 p-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {actionLoading.includes('Deleting') ? 'Deleting...' : 'Yes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Navbar />
    </div>
  )
}

export default Inventory
