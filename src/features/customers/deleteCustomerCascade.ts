import type { StorageAdapter } from '../../data/types'

/**
 * Deletes a customer safely across both StorageAdapter implementations.
 *
 * The production Supabase schema declares `orders.customer_id references
 * customers(id)` with NO `on delete cascade` (only `order_items.order_id`
 * cascades). Deleting a customer who still has orders would therefore fail
 * with a foreign-key violation on production Supabase. This helper deletes
 * the customer's orders first — `adapter.deleteOrder` already removes each
 * order's items on both adapters (LocalAdapter deletes order_items
 * manually; SupabaseAdapter relies on the DB cascade) — and only then
 * deletes the customer row, so the ordering is FK-safe on Supabase and
 * behaves identically against LocalAdapter.
 */
export async function deleteCustomerCascade(adapter: StorageAdapter, customerId: string): Promise<void> {
  const orders = await adapter.listOrders()
  const customerOrders = orders.filter((order) => order.customerId === customerId)
  for (const order of customerOrders) await adapter.deleteOrder(order.id)
  await adapter.deleteCustomer(customerId)
}
