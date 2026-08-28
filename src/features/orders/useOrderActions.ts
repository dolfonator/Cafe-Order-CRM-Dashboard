import { useState } from 'react'
import type { StorageAdapter, StoredOrder } from '../../data/types'
import { canAdvance, canCancel, nextStatus } from './orderLifecycle'

export function useOrderActions(adapter: StorageAdapter | null) {
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)

  const update = async (order: StoredOrder, patch: Parameters<StorageAdapter['updateOrder']>[1]) => {
    if (!adapter) return
    setBusyOrderId(order.id)
    try {
      await adapter.updateOrder(order.id, patch)
    } finally {
      setBusyOrderId(null)
    }
  }

  const advance = async (order: StoredOrder) => {
    if (!adapter || !canAdvance(order)) return
    const next = nextStatus(order.status)
    if (!next) return
    await update(order, { status: next, ...(next === 'paid' ? { paymentReceived: true } : {}) })
  }

  const cancel = async (order: StoredOrder) => {
    if (!canCancel(order.status)) return
    await update(order, { status: 'cancelled' })
  }

  const deleteOrder = async (order: StoredOrder) => {
    if (!adapter) return
    setBusyOrderId(order.id)
    try {
      await adapter.deleteOrder(order.id)
    } finally {
      setBusyOrderId(null)
    }
  }

  return { busyOrderId, setBusyOrderId, advance, cancel, deleteOrder }
}
