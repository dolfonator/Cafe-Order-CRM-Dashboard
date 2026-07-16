import { Clipboard, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getRuntimeCatalog } from '../../domain/catalog'
import type { StorageAdapter, StoredCustomer, StoredOrder } from '../../data/types'
import { loadDashboardSettings } from '../settings/settings-store'
import { applyCustomerMatch } from './customer-matching'
import { formatPhp, normalizeFunctionResponse, parseLocalInput, validateDraft } from './parser'
import { confirmImportDraft } from './persist'
import { buildViberChatGptPrompt } from './prompt'
import type { ImportDraft, ImportItem, ImportThermalBag } from './types'

type ImportWorkspaceProps = { adapter: StorageAdapter }

function blankItem(): ImportItem { return { id: crypto.randomUUID(), productSlug: 'matcha-latte', quantity: 1, level: 1, powder: 'yumeno' } }
function blankBag(): ImportThermalBag { return { id: crypto.randomUUID(), coveredCupCount: 1 } }

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4A5365]">{children}</label>
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`mt-1 min-h-11 w-full rounded-xl border border-[#4F74C8]/25 bg-white px-3 text-sm text-[#20242f] outline-none focus:border-[#4F74C8] focus:ring-2 focus:ring-[#4F74C8]/20 ${props.className ?? ''}`} />
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`mt-1 min-h-11 w-full rounded-xl border border-[#4F74C8]/25 bg-white px-3 text-sm text-[#20242f] outline-none focus:border-[#4F74C8] focus:ring-2 focus:ring-[#4F74C8]/20 ${props.className ?? ''}`} />
}

function updateItem(draft: ImportDraft, itemId: string, patch: Partial<ImportItem>): ImportDraft {
  return { ...draft, items: draft.items.map((item) => item.id === itemId ? { ...item, ...patch } : item) }
}

function DraftCard({ draft, customers, orders, confirming, onChange, onConfirm }: {
  draft: ImportDraft
  customers: StoredCustomer[]
  orders: StoredOrder[]
  confirming: boolean
  onChange: (draft: ImportDraft) => void
  onConfirm: () => void
}) {
  const catalog = getRuntimeCatalog()
  const validation = useMemo(() => validateDraft(draft), [draft, catalog])
  const mutate = (next: ImportDraft) => onChange(applyCustomerMatch(next, customers, orders))
  return (
    <article className="rounded-2xl border border-[#4F74C8]/20 bg-[#FFFDF6] p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h2 className="font-semibold text-[#20242f]">Editable order draft</h2><p className="mt-0.5 text-xs text-[#4A5365]">Source confidence: {draft.sourceConfidence === null ? 'not supplied' : `${Math.round(draft.sourceConfidence * 100)}%`}</p></div>
        <span className="rounded-full bg-[#4F74C8]/10 px-2.5 py-1 text-xs font-bold text-[#365aa8]">{validation.totalCentavos === null ? 'Needs review' : formatPhp(validation.totalCentavos)}</span>
      </div>
      {validation.errors.length > 0 && <div role="alert" className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800"><strong>Resolve before confirming</strong><ul className="mt-1 list-disc pl-5">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
      {validation.warnings.map((warning) => <div key={warning} className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{warning}</div>)}
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldLabel>Customer name<TextInput aria-label="Customer name" value={draft.customerName ?? ''} onChange={(event) => mutate({ ...draft, customerName: event.target.value || null })} /></FieldLabel>
        <FieldLabel>Matched customer<SelectInput aria-label="Matched customer" value={draft.matchedCustomerId ?? ''} onChange={(event) => onChange({ ...draft, matchedCustomerId: event.target.value || null })}><option value="">Create new customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</SelectInput></FieldLabel>
        <FieldLabel>Delivery date<TextInput aria-label="Delivery date" type="date" value={draft.deliveryDate ?? ''} onChange={(event) => onChange({ ...draft, deliveryDate: event.target.value || null })} /></FieldLabel>
        <FieldLabel>Address<TextInput aria-label="Address" value={draft.address ?? ''} onChange={(event) => onChange({ ...draft, address: event.target.value || null })} /></FieldLabel>
      </div>
      <FieldLabel><span className="mt-3 block">Notes</span><TextInput aria-label="Notes" value={draft.notes ?? ''} onChange={(event) => onChange({ ...draft, notes: event.target.value || null })} /></FieldLabel>
      <div className="mt-5 space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Drinks</h3><button type="button" className="text-sm font-semibold text-[#365aa8]" onClick={() => onChange({ ...draft, items: [...draft.items, blankItem()] })}><Plus className="mr-1 inline" size={15} />Add drink</button></div>
        {draft.items.map((item, index) => <div key={item.id} className="rounded-xl border border-[#4F74C8]/15 bg-white p-3">
          <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-[#4A5365]">Drink {index + 1}{validation.itemTotalsCentavos.has(item.id) ? ` · ${formatPhp(validation.itemTotalsCentavos.get(item.id)!)}` : ''}</span><button type="button" aria-label={`Remove drink ${index + 1}`} className="text-[#4A5365]" onClick={() => onChange({ ...draft, items: draft.items.filter((entry) => entry.id !== item.id) })}><Trash2 size={16} /></button></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <FieldLabel>Drink<SelectInput aria-label={`Drink ${index + 1}`} value={item.productSlug ?? ''} onChange={(event) => onChange(updateItem(draft, item.id, { productSlug: event.target.value || null, level: 1, powder: 'yumeno', sweetness: undefined }))}><option value="">Unresolved</option>{item.productSlug && !(item.productSlug in catalog) && <option value={item.productSlug}>Unresolved: {item.productSlug}</option>}{Object.entries(catalog).map(([slug, product]) => <option key={slug} value={slug}>{product.name}</option>)}</SelectInput></FieldLabel>
            <FieldLabel>Qty<TextInput aria-label={`Quantity ${index + 1}`} type="number" min="1" value={item.quantity ?? ''} onChange={(event) => onChange(updateItem(draft, item.id, { quantity: event.target.valueAsNumber || null }))} /></FieldLabel>
            <FieldLabel>Level<SelectInput aria-label={`Level ${index + 1}`} value={item.level ?? ''} onChange={(event) => onChange(updateItem(draft, item.id, { level: event.target.value ? Number(event.target.value) as 1 | 2 | 3 : null }))}><option value="">Unresolved</option><option value="1">L1</option><option value="2">L2</option><option value="3">L3</option></SelectInput></FieldLabel>
            <FieldLabel>Powder<SelectInput aria-label={`Powder ${index + 1}`} value={item.powder ?? ''} onChange={(event) => onChange(updateItem(draft, item.id, { powder: event.target.value === 'mk_isuzu' ? 'mk_isuzu' : event.target.value === 'yumeno' ? 'yumeno' : null }))}><option value="">Unresolved</option><option value="yumeno">Yumeno</option><option value="mk_isuzu">MK Isuzu</option></SelectInput></FieldLabel>
          </div>
          {(item.productSlug === 'matcha-latte' || item.productSlug === 'hojicha-latte' || item.sweetness) && <FieldLabel><span className="mt-2 block">Sweetness</span><SelectInput aria-label={`Sweetness ${index + 1}`} value={item.sweetness ?? ''} onChange={(event) => onChange(updateItem(draft, item.id, { sweetness: event.target.value ? event.target.value as 'none' | 'light' | 'regular' | 'extra' : undefined }))}><option value="">Not requested</option><option value="none">None</option><option value="light">Light</option><option value="regular">Regular</option><option value="extra">Extra</option></SelectInput></FieldLabel>}
        </div>)}
      </div>
      <div className="mt-5"><div className="flex items-center justify-between"><h3 className="font-semibold">Thermal bags</h3><button type="button" className="text-sm font-semibold text-[#365aa8]" onClick={() => onChange({ ...draft, thermalBags: [...draft.thermalBags, blankBag()] })}><Plus className="mr-1 inline" size={15} />Add bag</button></div>{draft.thermalBags.map((bag, index) => <div className="mt-2 flex items-end gap-2" key={bag.id}><FieldLabel>Bag {index + 1} covers<SelectInput aria-label={`Thermal bag ${index + 1}`} value={bag.coveredCupCount ?? ''} onChange={(event) => onChange({ ...draft, thermalBags: draft.thermalBags.map((entry) => entry.id === bag.id ? { ...entry, coveredCupCount: event.target.value ? Number(event.target.value) : null } : entry) })}><option value="">Unresolved</option><option value="1">1 cup</option><option value="2">2 cups</option><option value="3">3 cups</option><option value="4">4 cups</option></SelectInput></FieldLabel><button type="button" aria-label={`Remove thermal bag ${index + 1}`} className="min-h-11 rounded-xl px-2 text-[#4A5365]" onClick={() => onChange({ ...draft, thermalBags: draft.thermalBags.filter((entry) => entry.id !== bag.id) })}><Trash2 size={16} /></button></div>)}</div>
      <button type="button" disabled={confirming || validation.errors.length > 0} onClick={onConfirm} className="mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#4F74C8] px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{confirming && <LoaderCircle className="mr-2 animate-spin" size={17} />}Confirm order</button>
    </article>
  )
}

export function ImportWorkspace({ adapter }: ImportWorkspaceProps) {
  const [rawText, setRawText] = useState('')
  const [drafts, setDrafts] = useState<ImportDraft[]>([])
  const [customers, setCustomers] = useState<StoredCustomer[]>([])
  const [orders, setOrders] = useState<StoredOrder[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [, setCatalogVersion] = useState(0)

  useEffect(() => {
    let active = true
    const refreshCatalog = () => { void loadDashboardSettings(adapter).then(() => { if (active) setCatalogVersion((version) => version + 1) }) }
    refreshCatalog()
    const unsubscribe = adapter.subscribe((change) => { if (change.collection === 'settings') refreshCatalog() })
    return () => { active = false; unsubscribe() }
  }, [adapter])
  useEffect(() => { void Promise.all([adapter.listCustomers(), adapter.listOrders()]).then(([nextCustomers, nextOrders]) => { setCustomers(nextCustomers); setOrders(nextOrders) }) }, [adapter])
  const setDraft = (next: ImportDraft) => setDrafts((current) => current.map((draft) => draft.id === next.id ? next : draft))
  const parse = async () => {
    setMessage(null)
    const local = parseLocalInput(rawText)
    if (local.kind === 'empty') { setMessage('Paste an order conversation, JSON object, or JSON Lines first.'); return }
    if (local.kind === 'local') { setDrafts(local.drafts.map((draft) => applyCustomerMatch(draft, customers, orders))); setMessage(`Parsed locally — no network request was made.`); return }
    setLoading(true)
    try {
      const response = await fetch('/.netlify/functions/parse-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_text: rawText }) })
      const body: unknown = await response.json()
      if (!response.ok) throw new Error(typeof body === 'object' && body !== null && 'error' in body ? String(body.error) : 'The extraction service failed')
      setDrafts(normalizeFunctionResponse(body, rawText).map((draft) => applyCustomerMatch(draft, customers, orders)))
      setMessage('Parsed through the extraction service. Review every field before confirming.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The extraction service failed') } finally { setLoading(false) }
  }
  const copyPrompt = async () => { await navigator.clipboard.writeText(buildViberChatGptPrompt(getRuntimeCatalog())); setMessage('The @ChatGPT-in-Viber extraction prompt is copied.') }
  const confirm = async (draft: ImportDraft) => {
    if (confirmingId) return
    setConfirmingId(draft.id); setMessage(null)
    try {
      const order = await confirmImportDraft(adapter, draft)
      const [nextCustomers, nextOrders] = await Promise.all([adapter.listCustomers(), adapter.listOrders()])
      setCustomers(nextCustomers); setOrders(nextOrders); setDrafts((current) => current.filter((entry) => entry.id !== draft.id)); setMessage(`Order ${order.id.slice(0, 8)} was created as new.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Order confirmation failed') } finally { setConfirmingId(null) }
  }
  return <section className="space-y-4"><header><p className="text-sm font-bold uppercase tracking-[0.16em] text-[#365aa8]">Order intake</p><h1 className="mt-1 text-3xl font-black tracking-tight text-[#20242f]">Import</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[#4A5365]">Paste JSON, JSON Lines, or a Viber thread. Prices are calculated only from the catalog after review.</p></header>
    <div className="rounded-2xl border border-[#4F74C8]/20 bg-[#FFFDF6] p-4 shadow-sm"><FieldLabel>Order text or JSON<textarea aria-label="Order text or JSON" value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder={'{"customer_name":"Mika Santos","items":[...]}'} className="mt-1 min-h-44 w-full rounded-xl border border-[#4F74C8]/25 bg-white p-3 text-sm outline-none focus:border-[#4F74C8] focus:ring-2 focus:ring-[#4F74C8]/20" /></FieldLabel><button type="button" disabled={loading} onClick={() => void parse()} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#4F74C8] px-4 font-bold text-white disabled:opacity-50">{loading && <LoaderCircle className="mr-2 animate-spin" size={17} />}{loading ? 'Extracting structure…' : 'Create editable drafts'}</button><button type="button" onClick={() => void copyPrompt()} className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl border border-[#4F74C8]/30 px-4 text-sm font-bold text-[#365aa8]"><Clipboard className="mr-2" size={16} />Copy @ChatGPT-in-Viber prompt</button></div>
    {message && <p role="status" className="rounded-xl bg-[#4F74C8]/10 p-3 text-sm text-[#263d70]">{message}</p>}
    {drafts.map((draft) => <DraftCard key={draft.id} draft={draft} customers={customers} orders={orders} confirming={confirmingId === draft.id} onChange={setDraft} onConfirm={() => void confirm(draft)} />)}
  </section>
}
