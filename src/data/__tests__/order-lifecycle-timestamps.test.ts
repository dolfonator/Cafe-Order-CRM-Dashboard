/**
 * Storage-owned paidAt / deliveredAt contract.
 * LocalAdapter and SupabaseAdapter (via fake-postgrest trigger emulation)
 * must agree: client-supplied lifecycle timestamps are ignored; transitions
 * set them once; non-transitions preserve old values.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createFakePostgrest, fakeCreateClient } from './fake-postgrest'
import { LocalAdapter, resetLocalAdapterMemoryForTests } from '../local-adapter'
import type { StoredCustomer, StoredOrder, StoredOrderItem } from '../types'

const fake = createFakePostgrest()

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeCreateClient() }))

const { SupabaseAdapter } = await import('../supabase-adapter')

const createdAt = '2026-07-16T10:00:00.000Z'
const CUSTOMER_ID = '70000000-0000-4000-8000-000000000001'
const PRODUCT_ID = '10000000-0000-4000-8000-000000000001'
const ORDER_ID = '70000000-0000-4000-8000-000000000003'
const ITEM_ID = '70000000-0000-4000-8000-000000000002'

const customer: StoredCustomer = {
  id: CUSTOMER_ID,
  name: 'Lifecycle Customer',
  phone: null,
  createdAt,
  updatedAt: createdAt,
}

const item: StoredOrderItem = {
  id: ITEM_ID,
  orderId: ORDER_ID,
  productId: PRODUCT_ID,
  productName: 'Matcha Latte',
  quantity: 1,
  modifiers: { level: 1, powder: 'yumeno', sweetness: 'regular' },
  unitPriceCentavos: 20000,
  lineTotalCentavos: 20000,
  createdAt,
  updatedAt: createdAt,
}

const newOrder = (overrides: Partial<StoredOrder> = {}): StoredOrder => ({
  id: ORDER_ID,
  customerId: CUSTOMER_ID,
  status: 'new',
  items: [],
  subtotalCentavos: 20000,
  deliveryFeeCentavos: 2500,
  totalCentavos: 22500,
  deliveryDate: '2026-07-16',
  paymentReceived: false,
  rawSource: 'lifecycle-test',
  addressSnapshot: null,
  notes: null,
  routePosition: null,
  paidAt: null,
  deliveredAt: null,
  createdAt,
  updatedAt: createdAt,
  ...overrides,
})

async function supabaseReady() {
  const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
  await adapter.createCustomer(customer)
  await adapter.createProduct({
    id: PRODUCT_ID,
    name: 'Matcha Latte',
    priceCentavos: 20000,
    active: true,
    createdAt,
    updatedAt: createdAt,
  })
  return adapter
}

async function localReady() {
  resetLocalAdapterMemoryForTests()
  const adapter = await LocalAdapter.create()
  // Clear seed orders/customers so ids stay unique; keep products if needed
  for (const order of await adapter.listOrders()) await adapter.deleteOrder(order.id)
  for (const c of await adapter.listCustomers()) await adapter.deleteCustomer(c.id)
  await adapter.createCustomer(customer)
  return adapter
}

describe.each([
  { name: 'LocalAdapter', ready: localReady },
  { name: 'SupabaseAdapter', ready: supabaseReady },
] as const)('$name order lifecycle timestamps', ({ ready }) => {
  beforeEach(() => {
    fake.reset()
    resetLocalAdapterMemoryForTests()
  })

  it('new orders start with both paidAt and deliveredAt null', async () => {
    const adapter = await ready()
    const created = await adapter.createOrder(newOrder({ items: [item] }))
    expect(created.paidAt).toBeNull()
    expect(created.deliveredAt).toBeNull()
    const read = await adapter.getOrder(ORDER_ID)
    expect(read?.paidAt).toBeNull()
    expect(read?.deliveredAt).toBeNull()
    await adapter.close()
  })

  it('round-trips paidAt/deliveredAt through create → read', async () => {
    const adapter = await ready()
    // Insert as delivered so storage sets both; then read back
    const created = await adapter.createOrder(
      newOrder({
        status: 'delivered',
        paymentReceived: true,
        items: [],
        paidAt: '2026-07-16T09:00:00.000Z',
        deliveredAt: '2026-07-16T09:30:00.000Z',
      }),
    )
    expect(created.paidAt).toBe('2026-07-16T09:00:00.000Z')
    expect(created.deliveredAt).toBe('2026-07-16T09:30:00.000Z')
    const read = await adapter.getOrder(ORDER_ID)
    expect(read?.paidAt).toBe(created.paidAt)
    expect(read?.deliveredAt).toBe(created.deliveredAt)
    await adapter.close()
  })

  it('ignores client-supplied paidAt on a non-transition update', async () => {
    const adapter = await ready()
    await adapter.createOrder(newOrder({ items: [] }))
    const paid = await adapter.updateOrder(ORDER_ID, { status: 'paid', paymentReceived: true })
    expect(paid.paidAt).toBeTruthy()
    expect(paid.deliveredAt).toBeNull()
    const frozenPaidAt = paid.paidAt

    const patched = await adapter.updateOrder(ORDER_ID, {
      paidAt: '1999-01-01T00:00:00.000Z',
      notes: 'client tried to rewrite paidAt',
    })
    expect(patched.paidAt).toBe(frozenPaidAt)
    expect(patched.paidAt).not.toBe('1999-01-01T00:00:00.000Z')
    expect(patched.deliveredAt).toBeNull()
    expect(patched.notes).toBe('client tried to rewrite paidAt')
    await adapter.close()
  })

  it('transition new → paid sets paidAt once and leaves deliveredAt null', async () => {
    const adapter = await ready()
    await adapter.createOrder(newOrder({ items: [] }))
    const paid = await adapter.updateOrder(ORDER_ID, { status: 'paid', paymentReceived: true })
    expect(paid.paidAt).toEqual(expect.any(String))
    expect(paid.deliveredAt).toBeNull()
    await adapter.close()
  })

  it('transition paid → delivered sets deliveredAt and does not rewrite paidAt', async () => {
    const adapter = await ready()
    await adapter.createOrder(newOrder({ items: [] }))
    const paid = await adapter.updateOrder(ORDER_ID, { status: 'paid', paymentReceived: true })
    const frozenPaidAt = paid.paidAt
    expect(frozenPaidAt).toBeTruthy()

    const delivered = await adapter.updateOrder(ORDER_ID, { status: 'delivered' })
    expect(delivered.paidAt).toBe(frozenPaidAt)
    expect(delivered.deliveredAt).toEqual(expect.any(String))
    expect(delivered.deliveredAt).not.toBeNull()
    await adapter.close()
  })

  it('cancelling preserves existing paidAt and forces deliveredAt null', async () => {
    const adapter = await ready()
    await adapter.createOrder(newOrder({ items: [] }))
    const paid = await adapter.updateOrder(ORDER_ID, { status: 'paid', paymentReceived: true })
    const frozenPaidAt = paid.paidAt

    const cancelled = await adapter.updateOrder(ORDER_ID, { status: 'cancelled' })
    expect(cancelled.paidAt).toBe(frozenPaidAt)
    expect(cancelled.deliveredAt).toBeNull()
    await adapter.close()
  })

  it('a second paid → paid style update does not move paidAt', async () => {
    const adapter = await ready()
    await adapter.createOrder(newOrder({ items: [] }))
    const paid = await adapter.updateOrder(ORDER_ID, { status: 'paid', paymentReceived: true })
    const frozenPaidAt = paid.paidAt

    // Same status again (non-transition): paidAt must stay put
    const again = await adapter.updateOrder(ORDER_ID, { status: 'paid', paymentReceived: true, notes: 'noop' })
    expect(again.paidAt).toBe(frozenPaidAt)
    expect(again.deliveredAt).toBeNull()
    await adapter.close()
  })

  it('cancelling a never-paid order keeps paidAt null', async () => {
    const adapter = await ready()
    await adapter.createOrder(newOrder({ items: [] }))
    const cancelled = await adapter.updateOrder(ORDER_ID, { status: 'cancelled' })
    expect(cancelled.paidAt).toBeNull()
    expect(cancelled.deliveredAt).toBeNull()
    await adapter.close()
  })
})
