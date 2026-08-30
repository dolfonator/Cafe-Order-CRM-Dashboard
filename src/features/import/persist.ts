import type { StorageAdapter, StoredCustomer, StoredOrder } from '../../data/types'
import type { ImportDraft } from './types'
import { validateDraft } from './parser'
import { ensureCatalogProducts } from '../../data/ensure-catalog-products'
import { priceDraftItems } from './priceDraftItems'

function id(): string { return crypto.randomUUID() }
function now(): string { return new Date().toISOString() }

export async function confirmImportDraft(adapter: StorageAdapter, draft: ImportDraft): Promise<StoredOrder> {
  const validation = validateDraft(draft)
  if (validation.errors.length > 0 || validation.totalCentavos === null || !draft.customerName) {
    throw new Error(`Cannot confirm an invalid draft: ${validation.errors.join('; ')}`)
  }
  const [customers, productByName] = await Promise.all([adapter.listCustomers(), ensureCatalogProducts(adapter)])
  const matched = draft.matchedCustomerId ? customers.find((customer) => customer.id === draft.matchedCustomerId) : undefined
  const timestamp = now()
  const customer: StoredCustomer = matched
    ? (matched.name === draft.customerName ? matched : await adapter.updateCustomer(matched.id, { name: draft.customerName }))
    : await adapter.createCustomer({ id: id(), name: draft.customerName, phone: null, createdAt: timestamp, updatedAt: timestamp })
  const orderId = id()
  const { priced, items } = priceDraftItems({
    items: draft.items,
    thermalBags: draft.thermalBags,
    productByName,
    orderId,
    timestamp,
    customerName: draft.customerName,
  })
  // StorageAdapter persists the aggregate order and all of its items together (LocalAdapter's createOrder contract).
  return adapter.createOrder({
    id: orderId, customerId: customer.id, status: 'new', items,
    subtotalCentavos: priced.totals.itemsSubtotalCentavos,
    deliveryFeeCentavos: priced.totals.thermalBagsTotalCentavos,
    totalCentavos: priced.totals.totalCentavos,
    deliveryDate: draft.deliveryDate, paymentReceived: false, rawSource: draft.rawSource,
    addressSnapshot: draft.address, notes: draft.notes, routePosition: null,
    paidAt: null, deliveredAt: null,
    createdAt: timestamp, updatedAt: timestamp,
  })
}
