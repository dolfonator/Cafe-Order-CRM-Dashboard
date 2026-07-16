import { ArrowLeft, ChevronRight, Save, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { StorageAdapter, StoredOrder } from '../../data/types'
import { loadCustomerProfile, saveCustomerProfile, type CustomerProfile } from './customer-profile'
import { getCustomerSummaries, type CustomerSummary } from './customer-stats'

type CustomersFeatureProps = { adapter: StorageAdapter }

function formatDate(order: StoredOrder | null): string {
  if (!order?.deliveryDate) return 'No delivery date'
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
    .format(new Date(`${order.deliveryDate}T12:00:00+08:00`))
}

function formatCurrency(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function statusLabel(status: StoredOrder['status']): string {
  return status.replaceAll('_', ' ')
}

function CustomerList({ summaries }: { summaries: readonly CustomerSummary[] }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return summaries
    return summaries.filter(({ customer, favoriteDrink, addressSummary }) =>
      [customer.name, customer.phone ?? '', favoriteDrink ?? '', addressSummary ?? '']
        .some((value) => value.toLocaleLowerCase().includes(normalized)),
    )
  }, [query, summaries])

  return (
    <section aria-labelledby="customers-heading">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4F74C8]">CRM</p>
          <h1 id="customers-heading" className="mt-1 text-3xl font-black tracking-tight text-[#20242F]">Customers</h1>
        </div>
        <p className="mb-1 shrink-0 text-sm text-[#4A5365]">{summaries.length} total</p>
      </div>
      <label className="mb-4 flex min-h-12 items-center gap-2 rounded-2xl border border-[#4F74C8]/30 bg-white px-3 shadow-sm" htmlFor="customer-search">
        <Search aria-hidden="true" size={19} className="shrink-0 text-[#4F74C8]" />
        <span className="sr-only">Search customers</span>
        <input
          id="customer-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, drink, or address"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#4A5365]/70"
        />
      </label>
      <div className="space-y-3" aria-live="polite">
        {filtered.map((summary) => (
          <Link
            key={summary.customer.id}
            to={`/customers?customer=${encodeURIComponent(summary.customer.id)}`}
            className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#4F74C8]/20 bg-white p-4 shadow-sm transition-colors hover:border-[#4F74C8]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F74C8]"
            aria-label={`View ${summary.customer.name}`}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#4F74C8]/12 text-lg font-black text-[#4F74C8]">{summary.customer.name.slice(0, 1)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-[#20242F]">{summary.customer.name}</span>
              <span className="mt-1 block text-sm text-[#4A5365]">{summary.orderCount} non-cancelled {summary.orderCount === 1 ? 'order' : 'orders'} · {summary.favoriteDrink ?? 'No favorite yet'}</span>
              <span className="mt-1 block truncate text-xs text-[#4A5365]">{summary.addressSummary ?? 'No saved address'} · Last: {formatDate(summary.lastOrder)}</span>
            </span>
            <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-[#4F74C8]" />
          </Link>
        ))}
        {filtered.length === 0 && <p className="rounded-2xl border border-dashed border-[#4F74C8]/35 p-5 text-center text-sm text-[#4A5365]">No customers match that search.</p>}
      </div>
    </section>
  )
}

function CustomerDetail({ adapter, summary, orders }: { adapter: StorageAdapter; summary: CustomerSummary; orders: readonly StoredOrder[] }) {
  const [profile, setProfile] = useState<CustomerProfile>({ notes: '', address: summary.addressSummary ?? '', preferences: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const customerOrders = useMemo(
    () => orders.filter((order) => order.customerId === summary.customer.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [orders, summary.customer.id],
  )

  useEffect(() => {
    let active = true
    void loadCustomerProfile(adapter, summary.customer.id)
      .then((stored) => {
        if (active) setProfile({ ...stored, address: stored.address || summary.addressSummary || '' })
      })
      .catch(() => { if (active) setLoadError('Customer details could not be loaded.') })
    return () => { active = false }
  }, [adapter, summary.addressSummary, summary.customer.id])

  async function handleSave(): Promise<void> {
    setSaving(true)
    setSaved(false)
    try {
      await saveCustomerProfile(adapter, summary.customer.id, profile)
      setSaved(true)
    } catch {
      setLoadError('Customer details could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="customer-name">
      <Link to="/customers" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#4F74C8] hover:bg-[#4F74C8]/10">
        <ArrowLeft aria-hidden="true" size={19} /> All customers
      </Link>
      <div className="rounded-3xl bg-[#4F74C8] p-5 text-white shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/75">Customer profile</p>
        <h1 id="customer-name" className="mt-1 break-words text-3xl font-black">{summary.customer.name}</h1>
        <p className="mt-2 text-sm text-white/85">{summary.customer.phone ?? 'No phone number'} · {summary.orderCount} non-cancelled {summary.orderCount === 1 ? 'order' : 'orders'}</p>
        <p className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold">Favorite drink: {summary.favoriteDrink ?? 'Not enough order data'}</p>
      </div>

      <div className="mt-5 space-y-4">
        <section className="rounded-2xl border border-[#4F74C8]/20 bg-white p-4 shadow-sm" aria-labelledby="customer-details-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="customer-details-heading" className="text-lg font-black">Saved details</h2>
            {saved && <span role="status" className="text-sm font-bold text-[#356247]">Saved</span>}
          </div>
          <div className="mt-3 space-y-3">
            <label className="block text-sm font-bold text-[#20242F]">Address
              <textarea value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} rows={2} className="mt-1 block w-full resize-y rounded-xl border border-[#4F74C8]/30 bg-[#FBF3D5]/35 p-3 font-normal outline-none focus:border-[#4F74C8]" placeholder="Delivery address" />
            </label>
            <label className="block text-sm font-bold text-[#20242F]">Notes
              <textarea value={profile.notes} onChange={(event) => setProfile({ ...profile, notes: event.target.value })} rows={3} className="mt-1 block w-full resize-y rounded-xl border border-[#4F74C8]/30 bg-[#FBF3D5]/35 p-3 font-normal outline-none focus:border-[#4F74C8]" placeholder="Helpful service notes" />
            </label>
            <label className="block text-sm font-bold text-[#20242F]">Saved preferences
              <textarea value={profile.preferences} onChange={(event) => setProfile({ ...profile, preferences: event.target.value })} rows={2} className="mt-1 block w-full resize-y rounded-xl border border-[#4F74C8]/30 bg-[#FBF3D5]/35 p-3 font-normal outline-none focus:border-[#4F74C8]" placeholder="Sweetness, pickup, or delivery preferences" />
            </label>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#4F74C8] px-4 text-sm font-bold text-white disabled:opacity-60">
              <Save aria-hidden="true" size={17} /> {saving ? 'Saving…' : 'Save details'}
            </button>
            {loadError && <p role="alert" className="text-sm font-semibold text-red-700">{loadError}</p>}
          </div>
        </section>

        <section aria-labelledby="order-history-heading">
          <h2 id="order-history-heading" className="mb-3 text-lg font-black">Order history</h2>
          <div className="space-y-3">
            {customerOrders.map((order) => (
              <article key={order.id} className="rounded-2xl border border-[#4F74C8]/20 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-bold">{formatDate(order)}</p><p className="mt-1 text-sm capitalize text-[#4A5365]">{statusLabel(order.status)} · {order.paymentReceived ? 'Paid' : 'Unpaid'}</p></div>
                  <p className="shrink-0 font-black text-[#4F74C8]">{formatCurrency(order.totalCentavos)}</p>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-[#4A5365]">
                  {order.items.map((item) => <li key={item.id}>{item.quantity}× {item.productName}</li>)}
                </ul>
              </article>
            ))}
            {customerOrders.length === 0 && <p className="rounded-2xl border border-dashed border-[#4F74C8]/35 p-4 text-sm text-[#4A5365]">No order history yet.</p>}
          </div>
        </section>
      </div>
    </section>
  )
}

export function CustomersFeature({ adapter }: CustomersFeatureProps) {
  const [summaries, setSummaries] = useState<CustomerSummary[] | null>(null)
  const [orders, setOrders] = useState<StoredOrder[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const customerId = searchParams.get('customer')

  useEffect(() => {
    let active = true
    async function load(): Promise<void> {
      try {
        const [customers, loadedOrders] = await Promise.all([adapter.listCustomers(), adapter.listOrders()])
        if (active) {
          setSummaries(getCustomerSummaries(customers, loadedOrders))
          setOrders(loadedOrders)
        }
      } catch {
        if (active) setError('Customers could not be loaded.')
      }
    }
    void load()
    const unsubscribe = adapter.subscribe(() => { void load() })
    return () => { active = false; unsubscribe() }
  }, [adapter])

  if (error) return <p role="alert" className="rounded-2xl bg-red-50 p-4 font-semibold text-red-700">{error}</p>
  if (!summaries) return <section><h1 className="text-3xl font-black tracking-tight text-[#20242F]">Customers</h1><p className="pt-4 text-sm font-semibold text-[#4A5365]">Loading customers…</p></section>
  const selected = summaries.find((summary) => summary.customer.id === customerId)
  if (customerId && selected) return <CustomerDetail adapter={adapter} summary={selected} orders={orders} />
  return <CustomerList summaries={summaries} />
}
