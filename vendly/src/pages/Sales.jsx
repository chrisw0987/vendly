import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { Pencil, RotateCcw, Trash2, X } from 'lucide-react'

function Sales() {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [editingSale, setEditingSale] = useState(null)
  const [accountType, setAccountType] = useState('user')
  const [editForm, setEditForm] = useState({
    sale_type: 'cash',
    sale_quantity: 1,
    cash_received: '',
    trade_value: '',
    notes: '',
  })

  useEffect(() => {
    fetchSales()
  }, [])

  async function getUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return user
  }

  async function fetchAccountType(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', userId)
      .maybeSingle()

    if (error) return 'user'

    return data?.account_type || 'user'
  }

  async function fetchSales() {
    setLoading(true)
    setMessage('')

    const user = await getUser()

    if (!user) {
      setMessage('You must be logged in.')
      setLoading(false)
      return
    }

    const type = await fetchAccountType(user.id)
    setAccountType(type)

    const userIsVendor = type === 'vendor' || type === 'admin'

    if (!userIsVendor) {
      setSales([])
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('inventory_sales')
      .select(`
        *,
        inventory_items (
          id,
          card_name,
          set_name,
          card_number,
          image_url,
          quantity,
          is_sold
        )
      `)
      .eq('vendor_id', user.id)
      .order('sold_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      setSales([])
    } else {
      setSales(data || [])
    }

    setLoading(false)
  }

  function formatMoney(value) {
    return `$${Number(value || 0).toFixed(2)}`
  }

  function formatDate(date) {
    if (!date) return 'Unknown date'

    return new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function formatSaleType(type) {
    switch (type) {
      case 'cash':
        return 'Cash'
      case 'trade':
        return 'Trade'
      case 'cash_trade':
        return 'Cash + Trade'
      case 'other':
        return 'Other'
      default:
        return 'Sale'
    }
  }

  function openEditSale(sale) {
    setEditingSale(sale)
    setEditForm({
      sale_type: sale.sale_type || 'cash',
      sale_quantity: Number(sale.sale_quantity || 1),
      cash_received:
        sale.cash_received !== null && sale.cash_received !== undefined
          ? String(sale.cash_received)
          : '',
      trade_value:
        sale.trade_value !== null && sale.trade_value !== undefined
          ? String(sale.trade_value)
          : '',
      notes: sale.notes || '',
    })
  }

  async function saveSaleEdit() {
    if (!editingSale) return

    const cash = Number(editForm.cash_received || 0)
    const trade = Number(editForm.trade_value || 0)
    const quantity = Math.max(1, Number(editForm.sale_quantity || 1))
    const total = cash + trade
    const purchaseSnapshot = Number(editingSale.purchase_price_snapshot || 0)
    const profit = total - purchaseSnapshot * quantity

    const updates = {
      sale_type: editForm.sale_type,
      sale_quantity: quantity,
      cash_received: cash,
      trade_value: trade,
      total_sale_value: total,
      profit,
      notes: editForm.notes || null,
    }

    const { error } = await supabase
      .from('inventory_sales')
      .update(updates)
      .eq('id', editingSale.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setSales((current) =>
      current.map((sale) =>
        sale.id === editingSale.id ? { ...sale, ...updates } : sale
      )
    )

    setEditingSale(null)
    setMessage('Sale updated.')
  }

  async function undoSale(sale) {
    const item = sale.inventory_items

    if (!item?.id) {
      setMessage('This sale is connected to a deleted inventory item and cannot be restored.')
      return
    }

    const confirmed = window.confirm(
      `Undo this sale and restore ${sale.sale_quantity || 1} quantity back to inventory?`
    )

    if (!confirmed) return

    const restoredQuantity = Number(item.quantity || 0) + Number(sale.sale_quantity || 1)

    const { error: itemError } = await supabase
      .from('inventory_items')
      .update({
        quantity: restoredQuantity,
        is_sold: false,
      })
      .eq('id', item.id)

    if (itemError) {
      setMessage(itemError.message)
      return
    }

    const { error: saleError } = await supabase
      .from('inventory_sales')
      .delete()
      .eq('id', sale.id)

    if (saleError) {
      setMessage(saleError.message)
      return
    }

    setSales((current) => current.filter((s) => s.id !== sale.id))
    setMessage('Sale undone and quantity restored.')
  }

  async function deleteSaleOnly(sale) {
    const confirmed = window.confirm(
      'Delete this sale record only? This will not restore inventory quantity.'
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('inventory_sales')
      .delete()
      .eq('id', sale.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setSales((current) => current.filter((s) => s.id !== sale.id))
    setMessage('Sale record deleted.')
  }

  const totalProfit = sales.reduce(
    (sum, sale) => sum + Number(sale.profit || 0),
    0
  )

  const totalSalesValue = sales.reduce(
    (sum, sale) => sum + Number(sale.total_sale_value || 0),
    0
  )

  const totalSoldQty = sales.reduce(
    (sum, sale) => sum + Number(sale.sale_quantity || 1),
    0
  )


  const isVendor = accountType === 'vendor' || accountType === 'admin'

  if (!loading && !isVendor) {
    return (
      <div className="min-h-screen bg-black text-white pb-24">
        <main className="mx-auto max-w-[430px] px-5 pt-8">
          <div className="rounded-2xl border border-[#222] bg-[#111] p-6 text-center">
            <h1 className="text-2xl font-bold">Sales are vendor-only</h1>
            <p className="mt-2 text-sm text-gray-400">
              Regular users can track their collection from Inventory. Sales history unlocks after vendor approval.
            </p>
          </div>
        </main>

        <Navbar />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <main className="mx-auto max-w-[430px] px-5 pt-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Sales History</h1>
          <p className="mt-1 text-sm text-gray-400">
            Review, edit, or undo recorded sales.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-[#222] bg-[#111] p-3">
            <p className="text-xs text-gray-500">Sold Qty</p>
            <p className="mt-1 text-lg font-bold">{totalSoldQty}</p>
          </div>

          <div className="rounded-2xl border border-[#222] bg-[#111] p-3">
            <p className="text-xs text-gray-500">Sales</p>
            <p className="mt-1 text-lg font-bold text-yellow-300">
              {formatMoney(totalSalesValue)}
            </p>
          </div>

          <div className="rounded-2xl border border-[#222] bg-[#111] p-3">
            <p className="text-xs text-gray-500">Profit</p>
            <p
              className={`mt-1 text-lg font-bold ${
                totalProfit >= 0 ? 'text-green-300' : 'text-red-300'
              }`}
            >
              {formatMoney(totalProfit)}
            </p>
          </div>
        </div>

        {message && (
          <p className="mb-4 rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-gray-300">
            {message}
          </p>
        )}

        {loading && <p className="text-sm text-gray-400">Loading sales...</p>}

        {!loading && sales.length === 0 && (
          <div className="rounded-2xl border border-[#222] bg-[#111] p-6 text-center">
            <h2 className="text-lg font-semibold">No sales recorded yet</h2>
            <p className="mt-1 text-sm text-gray-400">
              When you sell inventory, sales will appear here.
            </p>
          </div>
        )}

        {!loading && sales.length > 0 && (
          <div className="space-y-3">
            {sales.map((sale) => {
              const item = sale.inventory_items

              return (
                <div
                  key={sale.id}
                  className="rounded-2xl border border-[#222] bg-[#111] p-4"
                >
                  <div className="flex gap-4">
                    {item?.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.card_name}
                        className="h-28 w-20 shrink-0 rounded-xl bg-black object-contain"
                      />
                    ) : (
                      <div className="h-28 w-20 shrink-0 rounded-xl bg-[#1a1a1a]" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {item?.card_name || 'Deleted item'}
                          </p>
                          <p className="mt-1 text-sm text-gray-400">
                            {item?.set_name || 'Set N/A'}
                            {item?.card_number ? ` #${item.card_number}` : ''}
                          </p>
                        </div>

                        <span className="rounded-full border border-[#333] bg-black px-2 py-1 text-xs text-gray-300">
                          x{sale.sale_quantity || 1}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-gray-400">
                        {formatSaleType(sale.sale_type)} · {formatDate(sale.sold_at)}
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl bg-black p-3">
                          <p className="text-gray-500">Total</p>
                          <p className="font-semibold text-yellow-300">
                            {formatMoney(sale.total_sale_value)}
                          </p>
                        </div>

                        <div className="rounded-xl bg-black p-3">
                          <p className="text-gray-500">Profit</p>
                          <p
                            className={`font-semibold ${
                              Number(sale.profit || 0) >= 0
                                ? 'text-green-300'
                                : 'text-red-300'
                            }`}
                          >
                            {formatMoney(sale.profit)}
                          </p>
                        </div>
                      </div>

                      <p className="mt-2 text-xs text-gray-500">
                        Cash: {formatMoney(sale.cash_received)} · Trade:{' '}
                        {formatMoney(sale.trade_value)}
                      </p>

                      {sale.notes && (
                        <p className="mt-2 rounded-xl bg-black p-3 text-sm text-gray-300">
                          {sale.notes}
                        </p>
                      )}

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          onClick={() => openEditSale(sale)}
                          className="flex items-center justify-center gap-1 rounded-xl border border-[#222] bg-black p-2 text-xs font-semibold text-gray-300"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>

                        <button
                          onClick={() => undoSale(sale)}
                          className="flex items-center justify-center gap-1 rounded-xl border border-green-900 bg-green-950/30 p-2 text-xs font-semibold text-green-300"
                        >
                          <RotateCcw size={14} />
                          Undo
                        </button>

                        <button
                          onClick={() => deleteSaleOnly(sale)}
                          className="flex items-center justify-center gap-1 rounded-xl border border-red-900 bg-red-950/30 p-2 text-xs font-semibold text-red-300"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {editingSale && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-5">
          <div className="mx-auto mt-8 w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Edit Sale</h2>
              <button onClick={() => setEditingSale(null)}>
                <X size={22} />
              </button>
            </div>

            <label className="mb-2 block text-sm text-gray-400">Sale Type</label>
            <select
              value={editForm.sale_type}
              onChange={(e) =>
                setEditForm({ ...editForm, sale_type: e.target.value })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            >
              <option value="cash">Cash</option>
              <option value="trade">Trade</option>
              <option value="cash_trade">Cash + Trade</option>
              <option value="other">Other</option>
            </select>

            <label className="mb-2 block text-sm text-gray-400">Quantity Sold</label>
            <input
              type="number"
              min="1"
              value={editForm.sale_quantity}
              onChange={(e) =>
                setEditForm({ ...editForm, sale_quantity: Number(e.target.value) })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <label className="mb-2 block text-sm text-gray-400">Cash Received</label>
            <input
              type="number"
              step="0.01"
              value={editForm.cash_received}
              onChange={(e) =>
                setEditForm({ ...editForm, cash_received: e.target.value })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <label className="mb-2 block text-sm text-gray-400">Trade Value</label>
            <input
              type="number"
              step="0.01"
              value={editForm.trade_value}
              onChange={(e) =>
                setEditForm({ ...editForm, trade_value: e.target.value })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <label className="mb-2 block text-sm text-gray-400">Notes</label>
            <textarea
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              className="mb-4 h-24 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <div className="mb-5 rounded-xl border border-[#222] bg-black p-4">
              <p className="text-sm text-gray-400">Updated Summary</p>
              <p className="mt-2 font-bold text-yellow-300">
                Total: {formatMoney(Number(editForm.cash_received || 0) + Number(editForm.trade_value || 0))}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Cost: {formatMoney(Number(editingSale.purchase_price_snapshot || 0) * Number(editForm.sale_quantity || 1))}
              </p>
              <p
                className={`mt-1 text-sm font-semibold ${
                  Number(editForm.cash_received || 0) +
                    Number(editForm.trade_value || 0) -
                    Number(editingSale.purchase_price_snapshot || 0) *
                      Number(editForm.sale_quantity || 1) >=
                  0
                    ? 'text-green-300'
                    : 'text-red-300'
                }`}
              >
                Profit: {formatMoney(
                  Number(editForm.cash_received || 0) +
                    Number(editForm.trade_value || 0) -
                    Number(editingSale.purchase_price_snapshot || 0) *
                      Number(editForm.sale_quantity || 1)
                )}
              </p>
            </div>

            <button
              onClick={saveSaleEdit}
              className="w-full rounded-xl bg-white p-4 font-semibold text-black"
            >
              Save Sale Changes
            </button>
          </div>
        </div>
      )}

      <Navbar />
    </div>
  )
}

export default Sales
