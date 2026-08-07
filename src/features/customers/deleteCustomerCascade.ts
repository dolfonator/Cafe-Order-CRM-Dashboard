import type { StorageAdapter } from '../../data/types'
import { customerProfileKey } from './customer-profile'

/**
 * Deletes a customer safely across both StorageAdapter implementations.
 *
 * The production Supabase schema declares `orders.customer_id references
 * customers(id)` with NO `on delete cascade` (only `order_items.order_id`
 * cascades). Deleting a customer who still has orders would therefore fail
 * with a foreign-key violation on production Supabase. This helper deletes
 * the customer's orders first — `adapter.deleteOrder` already removes each
 * order's items on both adapters (LocalAdapter deletes order_items
 * manually; SupabaseAdapter relies on the DB cascade) — then removes the
 * optional `customer:<uuid>:profile` settings row (CRM notes/address/prefs),
 * and only then deletes the customer row, so the ordering is FK-safe on
 * Supabase and behaves identically against LocalAdapter.
 *
 * These steps are sequential, not a single database transaction. A partial
 * failure after orders/profile deletion but before the customer row is removed
 * can leave an incomplete state until the owner retries.
 */
export async function deleteCustomerCascade(adapter: StorageAdapter, customerId: string): Promise<void> {
  const orders = await adapter.listOrders()
  const customerOrders = orders.filter((order) => order.customerId === customerId)
  for (const order of customerOrders) await adapter.deleteOrder(order.id)
  await adapter.deleteSetting(customerProfileKey(customerId))
  await adapter.deleteCustomer(customerId)
}
