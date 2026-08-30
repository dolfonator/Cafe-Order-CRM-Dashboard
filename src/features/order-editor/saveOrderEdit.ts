import type { StorageAdapter, StoredOrder } from '../../data/types'
import { validateDraft } from '../import/parser'
import { ensureCatalogProducts } from '../../data/ensure-catalog-products'
import { priceDraftItems } from '../import/priceDraftItems'
import type { ImportDraft } from '../import/types'

/**
 * Re-prices an edited draft through the pricing engine and persists it onto
 * an existing order.
 *
 * Item reconciliation deliberately goes through the granular order-item ops
 * (delete every existing order_item, then create the newly priced ones)
 * instead of passing a whole new item collection into `updateOrder`'s patch
 * argument. SupabaseAdapter's `updateOrder` does reconcile such a patch, but
 * LocalAdapter's does not — it only merges scalar fields onto the `orders`
 * record, and `listOrders` rebuilds the item collection from the separate
 * `orderItems` store. Patching the item collection through `updateOrder`
 * alone would silently leave stale rows on LocalAdapter (and therefore in
 * every test). Going through `listOrderItems`/`deleteOrderItem`/
 * `createOrderItem` keeps both adapters correct.
 *
 * The order's `id`, `customerId`, `status`, `paymentReceived`, `createdAt`,
 * and `rawSource` are preserved untouched — only pricing-derived and
 * draft-editable scalar fields are updated.
 */
export async function saveOrderEdit(adapter: StorageAdapter, order: StoredOrder, draft: ImportDraft): Promise<StoredOrder> {
  const validation = validateDraft(draft)
  if (validation.errors.length > 0 || validation.totalCentavos === null) {
    throw new Error(`Cannot save an invalid draft: ${validation.errors.join('; ')}`)
  }

  const productByName = await ensureCatalogProducts(adapter)
  const timestamp = new Date().toISOString()
  const { priced, items: newItems } = priceDraftItems({
    items: draft.items,
    thermalBags: draft.thermalBags,
    productByName,
    orderId: order.id,
    timestamp,
  })

  const existingItems = await adapter.listOrderItems(order.id)
  for (const item of existingItems) await adapter.deleteOrderItem(item.id)
  for (const item of newItems) await adapter.createOrderItem(item)

  const updated = await adapter.updateOrder(order.id, {
    subtotalCentavos: priced.totals.itemsSubtotalCentavos,
    deliveryFeeCentavos: priced.totals.thermalBagsTotalCentavos,
    totalCentavos: priced.totals.totalCentavos,
    deliveryDate: draft.deliveryDate,
    addressSnapshot: draft.address,
    notes: draft.notes,
  })

  return { ...updated, items: newItems }
}
