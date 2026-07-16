import { useMemo, useState } from 'react'
import type { StorageAdapter, StoredCustomer, StoredOrder } from '../../data/types'
import { OrderCard } from './OrderCard'
import { canAdvance, canCancel, nextStatus, operationalStatuses, statusLabels } from './orderLifecycle'
import { useOrdersData } from './useOrdersData'

function customerFor(customers: StoredCustomer[], order: StoredOrder): StoredCustomer | undefined {
  return customers.find((customer) => customer.id === order.customerId)
}

type OrdersHistoryProps = { adapter?: StorageAdapter }

export function OrdersHistory({ adapter: providedAdapter }: OrdersHistoryProps) {
  const { adapter, customers, orders, loading, error } = useOrdersData(providedAdapter)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | (typeof operationalStatuses)[number]>('all')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)

  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return orders
      .filter((order) => status === 'all' || order.status === status)
      .filter((order) => !deliveryDate || order.deliveryDate === deliveryDate)
      .filter((order) => {
        if (!normalizedQuery) return true
        const customer = customerFor(customers, order)
        return [customer?.name, customer?.phone, order.addressSnapshot, order.notes, order.id]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }, [customers, deliveryDate, orders, query, status])

  const update = async (order: StoredOrder, patch: Parameters<StorageAdapter['updateOrder']>[1]) => {
    if (!adapter) return
    setBusyOrderId(order.id)
    try {
      await adapter.updateOrder(order.id, patch)
    } finally {
      setBusyOrderId(null)
    }
  }

  const advance = async (order: StoredOrder, paymentConfirmed: boolean) => {
    if (!canAdvance(order, paymentConfirmed)) return
    const next = nextStatus(order.status)
    if (!next) return
    await update(order, { status: next })
  }

  const cancel = async (order: StoredOrder) => {
    if (canCancel(order.status)) await update(order, { status: 'cancelled' })
  }

  return (
    <section className="min-w-0">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#4F74C8]">All delivery dates</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[#20242F]">Orders</h1>
        <p className="mt-1 text-sm text-[#4A5365]">Search, review, and update your order history.</p>
      </header>

      <div className="mt-5 grid gap-3 rounded-2xl border border-[#4F74C8]/20 bg-white/60 p-3">
        <label className="grid gap-1 text-sm font-semibold text-[#20242F]">
          Search orders
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, address, or phone" className="min-w-0 rounded-xl border border-[#4F74C8]/30 bg-white px-3 py-2 text-[#20242F]" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold text-[#20242F]">
            Status
            <select aria-label="Status filter" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="rounded-xl border border-[#4F74C8]/30 bg-white px-3 py-2 text-[#20242F]">
              <option value="all">All statuses</option>
              {operationalStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[#20242F]">
            Delivery date
            <input aria-label="Delivery date filter" type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} className="rounded-xl border border-[#4F74C8]/30 bg-white px-3 py-2 text-[#20242F]" />
          </label>
        </div>
      </div>

      {loading && <p className="mt-6 text-sm text-[#4A5365]">Loading orders…</p>}
      {error && <p role="alert" className="mt-6 rounded-xl bg-rose-100 p-3 text-sm text-rose-900">{error.message}</p>}
      {!loading && !error && (
        <div className="mt-5 space-y-3" aria-label="Order history">
          <p className="text-sm font-semibold text-[#4A5365]">{visibleOrders.length} {visibleOrders.length === 1 ? 'order' : 'orders'}</p>
          {visibleOrders.map((order) => (
            <div key={order.id}>
              <p className="mb-1 px-1 text-xs font-bold uppercase tracking-[0.1em] text-[#697386]">{order.deliveryDate ?? 'No delivery date'} · {statusLabels[order.status]}</p>
              <OrderCard order={order} customer={customerFor(customers, order)} busy={busyOrderId === order.id} onAdvance={advance} onCancel={cancel} onPaymentReceived={(current, paymentReceived) => update(current, { paymentReceived })} />
            </div>
          ))}
          {visibleOrders.length === 0 && <p className="rounded-xl border border-dashed border-[#4F74C8]/25 bg-white/40 p-4 text-sm text-[#4A5365]">No orders match these filters.</p>}
        </div>
      )}
    </section>
  )
}
