import { describe, expect, it } from 'vitest'
import { LocalAdapter, resetLocalAdapterMemoryForTests } from '../../data/local-adapter'
import type { StorageAdapter, StoredOrder } from '../../data/types'
import { demoCustomers, demoOrders } from '../../demo/seed'
import { customerProfileKey, saveCustomerProfile } from './customer-profile'
import { deleteCustomerCascade } from './deleteCustomerCascade'

/** Wraps an adapter to record the sequence of deleteOrder/deleteCustomer calls, without changing behavior. */
function withCallLog(adapter: StorageAdapter, log: string[]): StorageAdapter {
  return new Proxy(adapter, {
    get(target, property, receiver) {
      if (property === 'deleteOrder') {
        return async (id: string) => { log.push(`deleteOrder:${id}`); return target.deleteOrder(id) }
      }
      if (property === 'deleteCustomer') {
        return async (id: string) => { log.push(`deleteCustomer:${id}`); return target.deleteCustomer(id) }
      }
      return Reflect.get(target, property, receiver)
    },
  })
}

describe('deleteCustomerCascade', () => {
  it('deletes every order belonging to the customer before deleting the customer row (FK-safety)', async () => {
    resetLocalAdapterMemoryForTests()
    const adapter = await LocalAdapter.create()
    const customerId = demoCustomers[0].id
    const customerOrderIds = demoOrders.filter((order) => order.customerId === customerId).map((order) => order.id)
    expect(customerOrderIds.length).toBeGreaterThan(0)

    const log: string[] = []
    await deleteCustomerCascade(withCallLog(adapter, log), customerId)

    const deleteCustomerIndex = log.indexOf(`deleteCustomer:${customerId}`)
    expect(deleteCustomerIndex).toBeGreaterThan(-1)
    for (const orderId of customerOrderIds) {
      const deleteOrderIndex = log.indexOf(`deleteOrder:${orderId}`)
      expect(deleteOrderIndex).toBeGreaterThan(-1)
      expect(deleteOrderIndex).toBeLessThan(deleteCustomerIndex)
    }

    await adapter.close()
  })

  it('leaves no orphan orders, order_items, or customer row after deletion', async () => {
    resetLocalAdapterMemoryForTests()
    const adapter = await LocalAdapter.create()
    const customerId = demoCustomers[0].id
    const customerOrderIds = demoOrders.filter((order) => order.customerId === customerId).map((order) => order.id)

    await deleteCustomerCascade(adapter, customerId)

    expect(await adapter.getCustomer(customerId)).toBeNull()
    const remainingOrders = await adapter.listOrders()
    expect(remainingOrders.some((order: StoredOrder) => order.customerId === customerId)).toBe(false)
    const remainingItems = await adapter.listOrderItems()
    for (const orderId of customerOrderIds) {
      expect(remainingItems.some((item) => item.orderId === orderId)).toBe(false)
    }
    // Other customers and their orders are untouched.
    expect(await adapter.getCustomer(demoCustomers[1].id)).not.toBeNull()

    await adapter.close()
  })

  it('deletes a customer with no orders without error', async () => {
    resetLocalAdapterMemoryForTests()
    const adapter = await LocalAdapter.create()
    const customerId = demoCustomers[2].id // Aira Cruz has no demo orders
    expect(demoOrders.some((order) => order.customerId === customerId)).toBe(false)

    await expect(deleteCustomerCascade(adapter, customerId)).resolves.toBeUndefined()
    expect(await adapter.getCustomer(customerId)).toBeNull()

    await adapter.close()
  })

  it('removes the customer profile settings row so profile PII does not remain after deletion', async () => {
    resetLocalAdapterMemoryForTests()
    const adapter = await LocalAdapter.create()
    const customerId = demoCustomers[0].id
    await saveCustomerProfile(adapter, customerId, {
      notes: 'Prefers quiet drop-off. Phone alternate: 09xx',
      address: '123 Private Lane, Makati',
      preferences: 'L2 yumeno only',
    })
    expect(await adapter.getSetting(customerProfileKey(customerId))).not.toBeNull()

    await deleteCustomerCascade(adapter, customerId)

    expect(await adapter.getCustomer(customerId)).toBeNull()
    expect(await adapter.getSetting(customerProfileKey(customerId))).toBeNull()
    const remainingSettings = await adapter.listSettings()
    expect(remainingSettings.some((setting) => setting.key === customerProfileKey(customerId))).toBe(false)
    expect(remainingSettings.some((setting) => {
      if (typeof setting.value !== 'object' || setting.value === null) return false
      const serialized = JSON.stringify(setting.value)
      return serialized.includes('Private Lane') || serialized.includes('09xx')
    })).toBe(false)

    await adapter.close()
  })
})
