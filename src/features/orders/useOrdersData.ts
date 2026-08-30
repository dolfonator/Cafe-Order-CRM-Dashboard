import { useEffect, useState } from 'react'
import { createStorageAdapter } from '../../data/adapter'
import { useStorageAdapter } from '../../data/useStorageAdapter'
import type { StorageAdapter, StoredCustomer, StoredOrder } from '../../data/types'

export type OrdersData = {
  adapter: StorageAdapter | null
  customers: StoredCustomer[]
  orders: StoredOrder[]
  loading: boolean
  error: Error | null
}

/** Loads a single live data snapshot and refreshes it after relevant adapter events. */
export function useOrdersData(providedAdapter?: StorageAdapter, options?: { deliveryDate?: string }): OrdersData {
  const { adapter: contextAdapter, fromProvider, loading: contextLoading, error: contextError } = useStorageAdapter()
  const [state, setState] = useState<OrdersData>({
    adapter: providedAdapter ?? contextAdapter ?? null,
    customers: [],
    orders: [],
    loading: true,
    error: null,
  })

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    let ownedAdapter: StorageAdapter | undefined

    const connect = async () => {
      try {
        const shared = providedAdapter ?? contextAdapter ?? null
        if (!shared && fromProvider && (contextLoading || contextError)) {
          if (contextError && active) {
            setState({
              adapter: null,
              customers: [],
              orders: [],
              loading: false,
              error: new Error(contextError),
            })
          }
          return
        }

        const adapter = shared ?? await createStorageAdapter()
        if (!active) {
          if (!shared) await adapter.close()
          return
        }

        ownedAdapter = shared ? undefined : adapter
        const refresh = async () => {
          const [orders, customers] = await Promise.all([
            adapter.listOrders(options?.deliveryDate !== undefined ? { deliveryDate: options.deliveryDate } : undefined),
            adapter.listCustomers(),
          ])
          if (active) setState({ adapter, orders, customers, loading: false, error: null })
        }

        unsubscribe = adapter.subscribe((change) => {
          if (change.collection === 'orders' || change.collection === 'orderItems' || change.collection === 'customers') {
            void refresh()
          }
        })
        await refresh()
      } catch (caught) {
        if (active) {
          setState({
            adapter: null,
            customers: [],
            orders: [],
            loading: false,
            error: caught instanceof Error ? caught : new Error('Unable to load orders.'),
          })
        }
      }
    }

    void connect()
    return () => {
      active = false
      unsubscribe?.()
      if (ownedAdapter) void ownedAdapter.close()
    }
  }, [providedAdapter, contextAdapter, fromProvider, contextLoading, contextError, options?.deliveryDate])

  return state
}
