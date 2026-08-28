import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePostgrest, fakeCreateClient, type Row } from './fake-postgrest'
import type { StoredCustomer, StoredOrder, StoredOrderItem, StoredProduct } from '../types'

const fake = createFakePostgrest()

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeCreateClient() }))

const { SupabaseAdapter } = await import('../supabase-adapter')

const createdAt = '2026-07-16T10:00:00.000Z'
const CUSTOMER_ID = '70000000-0000-4000-8000-000000000001'
const PRODUCT_ID = '10000000-0000-4000-8000-000000000001'
const ORDER_ID = '70000000-0000-4000-8000-000000000003'
const ITEM_ID = '70000000-0000-4000-8000-000000000002'

const customer: StoredCustomer = {
  id: CUSTOMER_ID, name: 'Test Customer', phone: null, createdAt, updatedAt: createdAt,
}
const product: StoredProduct = {
  id: PRODUCT_ID, name: 'Matcha Latte', priceCentavos: 20000, active: true, createdAt, updatedAt: createdAt,
}
const item: StoredOrderItem = {
  id: ITEM_ID, orderId: ORDER_ID, productId: PRODUCT_ID, productName: 'Matcha Latte', quantity: 1,
  modifiers: { level: 1, powder: 'yumeno' }, unitPriceCentavos: 20000, lineTotalCentavos: 20000,
  createdAt, updatedAt: createdAt,
}
const order: StoredOrder = {
  id: ORDER_ID, customerId: CUSTOMER_ID, status: 'new', items: [item],
  subtotalCentavos: 20000, deliveryFeeCentavos: 2500, totalCentavos: 22500,
  deliveryDate: '2026-07-16', paymentReceived: false, rawSource: 'rpc-test',
  addressSnapshot: 'Walnut 33', notes: null, routePosition: null,
  paidAt: null, deliveredAt: null, createdAt, updatedAt: createdAt,
}

describe('SupabaseAdapter aggregate RPCs', () => {
  beforeEach(() => {
    fake.reset()
  })

  it('falls back to table inserts when create_order_with_items is missing', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    await adapter.createCustomer(customer)
    await adapter.createProduct(product)
    const created = await adapter.createOrder(order)
    expect(created.id).toBe(ORDER_ID)
    expect(created.items).toHaveLength(1)
    expect(fake.rpcCalls.map((call) => call.name)).toContain('create_order_with_items')
    expect(fake.inserts.some((row) => row.id === ORDER_ID)).toBe(true)
  })

  it('uses create_order_with_items when the RPC exists', async () => {
    fake.rpcHandlers.create_order_with_items = (args) => {
      const pOrder = args.p_order as Row
      const pItems = args.p_items as Row[]
      fake.tables.orders = [...(fake.tables.orders ?? []), pOrder]
      fake.tables.order_items = [...(fake.tables.order_items ?? []), ...pItems]
      return { data: pOrder, error: null }
    }
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    await adapter.createCustomer(customer)
    await adapter.createProduct(product)
    const created = await adapter.createOrder(order)
    expect(created.id).toBe(ORDER_ID)
    expect(created.items).toHaveLength(1)
    expect(fake.inserts.some((row) => row.id === ORDER_ID)).toBe(false)
    expect(fake.rpcCalls.filter((call) => call.name === 'create_order_with_items')).toHaveLength(1)
  })

  it('uses delete_customer_cascade when the RPC exists', async () => {
    fake.rpcHandlers.delete_customer_cascade = (args) => {
      const id = args.p_customer_id
      fake.tables.orders = (fake.tables.orders ?? []).filter((row) => row.customer_id !== id)
      fake.tables.settings = (fake.tables.settings ?? []).filter((row) => row.key !== `customer:${id}:profile`)
      fake.tables.customers = (fake.tables.customers ?? []).filter((row) => row.id !== id)
      return { data: null, error: null }
    }
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    await adapter.createCustomer(customer)
    await adapter.deleteCustomerCascade!(customer.id)
    expect(await adapter.getCustomer(customer.id)).toBeNull()
    expect(fake.rpcCalls.map((call) => call.name)).toContain('delete_customer_cascade')
  })
})
