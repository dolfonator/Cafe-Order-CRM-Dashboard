import type { StoredCustomer, StoredOrder } from '../../data/types'

export type CustomerSummary = {
  customer: StoredCustomer
  orderCount: number
  lastOrder: StoredOrder | null
  favoriteDrink: string | null
  addressSummary: string | null
}

type DrinkTally = { quantity: number; lastOrder: StoredOrder }

export type DrinkQuantity = { name: string; quantity: number }

export function isNonCancelled(order: StoredOrder): boolean {
  return order.status !== 'cancelled'
}

export function compareOrderRecency(left: StoredOrder, right: StoredOrder): number {
  const deliveryComparison = (left.deliveryDate ?? '').localeCompare(right.deliveryDate ?? '')
  if (deliveryComparison !== 0) return deliveryComparison
  return left.createdAt.localeCompare(right.createdAt)
}

/** Tallies product quantities across orders; sorted by quantity desc, then recency, then name. */
export function getSortedDrinkTallies(orders: readonly StoredOrder[]): DrinkQuantity[] {
  const drinks = new Map<string, DrinkTally>()
  for (const order of orders) {
    for (const item of order.items) {
      const current = drinks.get(item.productName)
      if (!current) {
        drinks.set(item.productName, { quantity: item.quantity, lastOrder: order })
        continue
      }
      current.quantity += item.quantity
      if (compareOrderRecency(order, current.lastOrder) > 0) current.lastOrder = order
    }
  }

  return [...drinks.entries()]
    .sort(([leftName, left], [rightName, right]) => {
      if (left.quantity !== right.quantity) return right.quantity - left.quantity
      const recency = compareOrderRecency(right.lastOrder, left.lastOrder)
      return recency !== 0 ? recency : leftName.localeCompare(rightName)
    })
    .map(([name, tally]) => ({ name, quantity: tally.quantity }))
}

export function getFavoriteDrink(orders: readonly StoredOrder[]): string | null {
  return getSortedDrinkTallies(orders.filter(isNonCancelled))[0]?.name ?? null
}

export function getCustomerSummaries(
  customers: readonly StoredCustomer[],
  orders: readonly StoredOrder[],
): CustomerSummary[] {
  return customers.map((customer) => {
    const customerOrders = orders.filter((order) => order.customerId === customer.id && isNonCancelled(order))
    const lastOrder = customerOrders.reduce<StoredOrder | null>(
      (latest, order) => !latest || compareOrderRecency(order, latest) > 0 ? order : latest,
      null,
    )
    return {
      customer,
      orderCount: customerOrders.length,
      lastOrder,
      favoriteDrink: getFavoriteDrink(customerOrders),
      addressSummary: lastOrder?.addressSnapshot ?? null,
    }
  }).sort((left, right) => left.customer.name.localeCompare(right.customer.name))
}
