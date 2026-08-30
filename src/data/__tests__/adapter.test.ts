import { describe, expect, it, beforeEach } from 'vitest'
import { createStorageAdapter } from '../adapter'
import { LocalAdapter, resetLocalAdapterMemoryForTests } from '../local-adapter'
import type { StoredCustomer, StoredOrder, StoredOrderItem } from '../types'

const createdAt = '2026-07-16T10:00:00.000Z'
const customer: StoredCustomer = { id: '70000000-0000-4000-8000-000000000001', name: 'Test Customer', phone: '09170000000', createdAt, updatedAt: createdAt }
const item: StoredOrderItem = { id: '70000000-0000-4000-8000-000000000002', orderId: '70000000-0000-4000-8000-000000000003', productId: '10000000-0000-4000-8000-000000000001', productName: 'Matcha Latte', quantity: 1, modifiers: { level: 1, powder: 'yumeno', sweetness: 'regular' }, unitPriceCentavos: 20000, lineTotalCentavos: 20000, createdAt, updatedAt: createdAt }
const order: StoredOrder = { id: item.orderId, customerId: customer.id, status: 'new', items: [item], subtotalCentavos: 20000, deliveryFeeCentavos: 2500, totalCentavos: 22500, deliveryDate: '2026-07-16', paymentReceived: false, rawSource: 'test', addressSnapshot: null, notes: null, routePosition: null, paidAt: null, deliveredAt: null, createdAt, updatedAt: createdAt }

describe('LocalAdapter', () => {
  beforeEach(() => resetLocalAdapterMemoryForTests())

  it('creates a seeded local adapter when no Supabase values are configured', async () => {
    const adapter = await createStorageAdapter({})
    expect(adapter).toBeInstanceOf(LocalAdapter)
    expect(await adapter.listProducts()).toHaveLength(6)
    expect(await adapter.listCustomers()).not.toHaveLength(0)
    expect(await adapter.listOrders()).not.toHaveLength(0)
    await adapter.close()
  })

  it('persists customer, order, items, and settings across adapter recreation', async () => {
    const first = await LocalAdapter.create()
    await first.createCustomer(customer)
    await first.createOrder(order)
    await first.setSetting({ id: '70000000-0000-4000-8000-000000000004', key: 'dispatch_cutoff', value: '17:00', createdAt, updatedAt: createdAt })
    await first.close()

    const second = await LocalAdapter.create()
    expect(await second.getCustomer(customer.id)).toMatchObject({ name: 'Test Customer' })
    expect(await second.getOrder(order.id)).toMatchObject({ totalCentavos: 22500, items: [{ id: item.id }] })
    expect(await second.getOrderItem(item.id)).toMatchObject({ lineTotalCentavos: 20000 })
    expect(await second.getSetting('dispatch_cutoff')).toMatchObject({ value: '17:00' })
    await second.updateOrder(order.id, { status: 'paid', paymentReceived: true })
    await second.updateOrderItem(item.id, { quantity: 2, lineTotalCentavos: 40000 })
    await second.setSetting({ id: 'ignored-on-update', key: 'dispatch_cutoff', value: '18:00', createdAt, updatedAt: createdAt })
    expect(await second.getOrder(order.id)).toMatchObject({ status: 'paid', paymentReceived: true })
    expect(await second.getOrderItem(item.id)).toMatchObject({ quantity: 2 })
    expect(await second.getSetting('dispatch_cutoff')).toMatchObject({ value: '18:00' })
    await second.deleteSetting('dispatch_cutoff')
    expect(await second.getSetting('dispatch_cutoff')).toBeNull()
    await second.deleteOrder(order.id)
    expect(await second.getOrderItem(item.id)).toBeNull()
    await second.deleteCustomer(customer.id)
    expect(await second.getCustomer(customer.id)).toBeNull()
    await second.close()
  })

  it('emits typed changes and stops after unsubscribe', async () => {
    const adapter = await LocalAdapter.create()
    const changes: string[] = []
    const unsubscribe = adapter.subscribe((change) => changes.push(`${change.collection}:${change.operation}`))
    await adapter.createCustomer(customer)
    await adapter.updateCustomer(customer.id, { name: 'Updated Customer' })
    unsubscribe()
    await adapter.deleteCustomer(customer.id)
    expect(changes).toEqual(['customers:insert', 'customers:update'])
    await adapter.close()
  })

  it('fails fast for partial Supabase configuration', async () => {
    await expect(createStorageAdapter({ supabaseUrl: 'https://example.supabase.co' })).rejects.toThrow('Supabase configuration is incomplete')
  })

  /**
   * Documents the LocalAdapter trap: `updateOrder(id, { items })` merges the
   * `items` array onto the orders record only. `listOrders`/`getOrder` rebuild
   * items from the separate `orderItems` store, so stale rows remain. Callers
   * must use granular item ops (see `saveOrderEdit`). Do not "fix" this.
   */
  it('updateOrder(id, { items }) does not rewrite the orderItems store', async () => {
    const adapter = await LocalAdapter.create()
    await adapter.createCustomer(customer)
    await adapter.createOrder(order)

    const replacement: StoredOrderItem = {
      ...item,
      id: '70000000-0000-4000-8000-000000000009',
      quantity: 2,
      lineTotalCentavos: 40000,
    }

    const updated = await adapter.updateOrder(order.id, {
      items: [replacement],
      subtotalCentavos: 40000,
      totalCentavos: 42500,
    })

    // The returned order object carries the patched `items` array (merge onto the orders row).
    expect(updated.items).toEqual([replacement])
    expect(updated.subtotalCentavos).toBe(40000)

    // But the orderItems store is untouched — original item remains, replacement was never written.
    const storedItems = await adapter.listOrderItems(order.id)
    expect(storedItems).toHaveLength(1)
    expect(storedItems[0].id).toBe(item.id)
    expect(storedItems[0].quantity).toBe(1)

    // listOrders/getOrder rebuild from orderItems, so they expose the stale item, not the patch.
    const fromGet = await adapter.getOrder(order.id)
    expect(fromGet!.items).toHaveLength(1)
    expect(fromGet!.items[0].id).toBe(item.id)
    expect(fromGet!.subtotalCentavos).toBe(40000)

    await adapter.close()
  })

  it('listOrders() without a filter returns full history; a deliveryDate filter scopes the join', async () => {
    const adapter = await LocalAdapter.create()
    await adapter.createCustomer(customer)
    await adapter.createOrder(order)
    const later: StoredOrder = {
      ...order,
      id: '70000000-0000-4000-8000-000000000013',
      deliveryDate: '2026-07-17',
      items: [{ ...item, id: '70000000-0000-4000-8000-000000000014', orderId: '70000000-0000-4000-8000-000000000013' }],
    }
    await adapter.createOrder(later)

    const all = await adapter.listOrders()
    expect(all.map((entry) => entry.id)).toEqual(expect.arrayContaining([order.id, later.id]))

    const scoped = await adapter.listOrders({ deliveryDate: '2026-07-17' })
    expect(scoped).toHaveLength(1)
    expect(scoped[0].id).toBe(later.id)
    expect(scoped[0].items).toHaveLength(1)

    const updated = await adapter.updateOrder(order.id, { routePosition: 3 })
    expect(updated.routePosition).toBe(3)
    expect((await adapter.getOrder(order.id))?.routePosition).toBe(3)
    await adapter.close()
  })
})
