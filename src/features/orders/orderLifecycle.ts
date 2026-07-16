import type { OrderStatus } from '../../domain/contracts'
import type { StoredOrder } from '../../data/types'

export const operationalStatuses: readonly OrderStatus[] = [
  'new',
  'confirmed',
  'paid',
  'making',
  'out_for_delivery',
  'delivered',
  'cancelled',
]

export const statusLabels: Readonly<Record<OrderStatus, string>> = {
  new: 'New',
  confirmed: 'Confirmed',
  paid: 'Paid',
  making: 'Making',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const forwardTransitions: Readonly<Partial<Record<OrderStatus, OrderStatus>>> = {
  new: 'confirmed',
  confirmed: 'paid',
  paid: 'making',
  making: 'out_for_delivery',
  out_for_delivery: 'delivered',
}

export function nextStatus(status: OrderStatus): OrderStatus | null {
  return forwardTransitions[status] ?? null
}

export function canCancel(status: OrderStatus): boolean {
  return status !== 'delivered' && status !== 'cancelled'
}

export function requiresPaymentConfirmation(order: StoredOrder): boolean {
  return order.status === 'confirmed' && !order.paymentReceived
}

export function canAdvance(order: StoredOrder, paymentConfirmed = false): boolean {
  const next = nextStatus(order.status)
  if (!next) return false
  return next !== 'paid' || order.paymentReceived || paymentConfirmed
}

export function nextAction(order: StoredOrder): string {
  const next = nextStatus(order.status)
  if (!next) return order.status === 'cancelled' ? 'Cancelled — no further action' : 'Delivered — complete'
  if (requiresPaymentConfirmation(order)) return 'Confirm payment before marking paid'
  return `Mark ${statusLabels[next].toLowerCase()}`
}
