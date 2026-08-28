/**
 * Presentation helpers shared by the order surfaces (cards, history, editor).
 *
 * These live outside `OrderCard.tsx` because a component file that also exports
 * non-components breaks React Fast Refresh — do not move them back.
 */
import type { StoredCustomer, StoredOrder } from '../../data/types'
import { formatPesos } from '../../domain/money'

export function formatPhp(centavos: number): string {
  return formatPesos(centavos)
}

export function customerFor(customers: StoredCustomer[], order: StoredOrder): StoredCustomer | undefined {
  return customers.find((customer) => customer.id === order.customerId)
}

export function cupCount(order: StoredOrder): number {
  return order.items.reduce((total, item) => total + item.quantity, 0)
}
