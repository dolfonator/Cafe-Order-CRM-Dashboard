/**
 * Adapter-parity contract suite.
 *
 * SupabaseAdapter (via fake postgrest that enforces schema.sql) and LocalAdapter
 * must agree on happy-path round-trips. Where LocalAdapter is more permissive
 * than Postgres, the divergence is asserted explicitly — that blind spot is
 * exactly what hid the July 2026 production defects.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createFakePostgrest, fakeCreateClient } from './fake-postgrest'
import { LocalAdapter, resetLocalAdapterMemoryForTests } from '../local-adapter'
import { ensureCatalogProducts } from '../ensure-catalog-products'
import { PRODUCT_CATALOG } from '../../domain/catalog'
import type { OrderStatus, StorageChange, StoredCustomer, StoredOrder, StoredOrderItem, StoredProduct, Setting } from '../types'

const fake = createFakePostgrest()

// vi.mock must precede the top-level await import of supabase-adapter (load-bearing).
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeCreateClient() }))

const { SupabaseAdapter } = await import('../supabase-adapter')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const createdAt = '2026-07-16T10:00:00.000Z'
const CATALOG_COUNT = Object.values(PRODUCT_CATALOG).length

const CUSTOMER_ID = '70000000-0000-4000-8000-000000000001'
const PRODUCT_ID = '10000000-0000-4000-8000-000000000001'
const ORDER_ID = '70000000-0000-4000-8000-000000000003'
const ITEM_ID = '70000000-0000-4000-8000-000000000002'
const SETTING_ID = '70000000-0000-4000-8000-000000000004'

const customerFixture = (overrides: Partial<StoredCustomer> = {}): StoredCustomer => ({
  id: CUSTOMER_ID,
  name: 'Test Customer',
  phone: '09170000000',
  createdAt,
  updatedAt: createdAt,
  ...overrides,
})

const productFixture = (overrides: Partial<StoredProduct> = {}): StoredProduct => ({
  id: PRODUCT_ID,
  name: 'Matcha Latte',
  priceCentavos: 20000,
  active: true,
  createdAt,
  updatedAt: createdAt,
  ...overrides,
})

const itemFixture = (overrides: Partial<StoredOrderItem> = {}): StoredOrderItem => ({
  id: ITEM_ID,
  orderId: ORDER_ID,
  productId: PRODUCT_ID,
  productName: 'Matcha Latte',
  quantity: 1,
  modifiers: { level: 1, powder: 'yumeno', sweetness: 'regular', cupNames: ['Ana', 'Ben'] },
  unitPriceCentavos: 20000,
  lineTotalCentavos: 20000,
  createdAt,
  updatedAt: createdAt,
  ...overrides,
})

const orderFixture = (overrides: Partial<StoredOrder> = {}): StoredOrder => ({
  id: ORDER_ID,
  customerId: CUSTOMER_ID,
  status: 'new',
  items: [itemFixture()],
  subtotalCentavos: 20000,
  deliveryFeeCentavos: 2500,
  totalCentavos: 22500,
  deliveryDate: '2026-07-16',
  paymentReceived: false,
  rawSource: 'parity-test',
  addressSnapshot: 'Walnut 33',
  notes: 'leave at gate',
  routePosition: 1,
  paidAt: null,
  deliveredAt: null,
  createdAt,
  updatedAt: createdAt,
  ...overrides,
})

async function supabaseAdapter() {
  return SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
}

async function localAdapter() {
  resetLocalAdapterMemoryForTests()
  return LocalAdapter.create()
}

/** LocalAdapter seeds demo products; strip them to reproduce the empty-registry deployment state. */
async function localWithNoProducts() {
  const adapter = await localAdapter()
  for (const product of await adapter.listProducts()) await adapter.deleteProduct(product.id)
  expect(await adapter.listProducts()).toHaveLength(0)
  return adapter
}

describe('adapter parity', () => {
  beforeEach(() => {
    fake.reset()
    resetLocalAdapterMemoryForTests()
  })

  // ── Round-trip fidelity ──────────────────────────────────────────────────

  describe('round-trip fidelity', () => {
    it('customers: create → read preserves every field on both adapters', async () => {
      const input = customerFixture({ phone: null })

      const sb = await supabaseAdapter()
      const sbSaved = await sb.createCustomer(input)
      const sbRead = await sb.getCustomer(input.id)
      expect(sbSaved).toEqual(input)
      expect(sbRead).toEqual(input)

      const local = await localAdapter()
      const localSaved = await local.createCustomer(input)
      const localRead = await local.getCustomer(input.id)
      expect(localSaved).toEqual(input)
      expect(localRead).toEqual(input)
      await local.close()
    })

    it('products: create → read preserves every field on both adapters', async () => {
      const input = productFixture({ priceCentavos: 22000, active: false, name: 'Strawberry Matcha' })

      const sb = await supabaseAdapter()
      expect(await sb.createProduct(input)).toEqual(input)
      expect(await sb.getProduct(input.id)).toEqual(input)

      const local = await localAdapter()
      expect(await local.createProduct(input)).toEqual(input)
      expect(await local.getProduct(input.id)).toEqual(input)
      await local.close()
    })

    it('orders + order_items: create → read preserves fields including modifiers.cupNames jsonb', async () => {
      const customer = customerFixture()
      const product = productFixture()
      const item = itemFixture({
        modifiers: { level: 2, powder: 'mk_isuzu', sweetness: 'light', cupNames: ['Cara', 'Diego'] },
        quantity: 2,
        unitPriceCentavos: 26000,
        lineTotalCentavos: 52000,
      })
      const order = orderFixture({
        items: [item],
        subtotalCentavos: 52000,
        totalCentavos: 54500,
      })

      const sb = await supabaseAdapter()
      await sb.createCustomer(customer)
      await sb.createProduct(product)
      const sbSaved = await sb.createOrder(order)
      const sbRead = await sb.getOrder(order.id)
      expect(sbSaved).toMatchObject({
        id: order.id,
        customerId: customer.id,
        status: 'new',
        paymentReceived: false,
        subtotalCentavos: 52000,
        deliveryFeeCentavos: 2500,
        totalCentavos: 54500,
        deliveryDate: '2026-07-16',
        rawSource: 'parity-test',
        addressSnapshot: 'Walnut 33',
        notes: 'leave at gate',
        routePosition: 1,
      })
      expect(sbSaved.items).toHaveLength(1)
      expect(sbSaved.items[0]).toMatchObject({
        id: item.id,
        orderId: order.id,
        productId: product.id,
        productName: 'Matcha Latte',
        quantity: 2,
        modifiers: { level: 2, powder: 'mk_isuzu', sweetness: 'light', cupNames: ['Cara', 'Diego'] },
        unitPriceCentavos: 26000,
        lineTotalCentavos: 52000,
      })
      expect(sbRead).toEqual(sbSaved)
      expect(await sb.getOrderItem(item.id)).toMatchObject({
        modifiers: { level: 2, powder: 'mk_isuzu', sweetness: 'light', cupNames: ['Cara', 'Diego'] },
      })

      const local = await localAdapter()
      await local.createCustomer(customer)
      // LocalAdapter may already have a product with PRODUCT_ID from seed; use a distinct id.
      const localProduct = productFixture({ id: '10000000-0000-4000-8000-000000000099' })
      const localItem = itemFixture({ productId: localProduct.id, modifiers: item.modifiers, quantity: 2, unitPriceCentavos: 26000, lineTotalCentavos: 52000 })
      const localOrder = orderFixture({ items: [localItem], subtotalCentavos: 52000, totalCentavos: 54500 })
      await local.createProduct(localProduct)
      const localSaved = await local.createOrder(localOrder)
      expect(localSaved.items[0].modifiers).toEqual({
        level: 2,
        powder: 'mk_isuzu',
        sweetness: 'light',
        cupNames: ['Cara', 'Diego'],
      })
      expect(await local.getOrder(localOrder.id)).toEqual(localSaved)
      await local.close()
    })
  })

  // ── UUID class (settings bug generalised) ────────────────────────────────

  describe('uuid column rejection (settings bug generalised)', () => {
    // Divergence note: LocalAdapter accepts client-invented non-uuid ids; SupabaseAdapter
    // (Postgres) rejects them with 22P02. This exact blind spot hid the production defect
    // where settings.id was minted as `settings-1753…` and every first save failed.

    it('rejects non-uuid products.id on SupabaseAdapter; LocalAdapter accepts it', async () => {
      const bad = productFixture({ id: 'product-not-a-uuid' })
      const sb = await supabaseAdapter()
      await expect(sb.createProduct(bad)).rejects.toThrow(/invalid input syntax for type uuid/)

      const local = await localAdapter()
      await expect(local.createProduct(bad)).resolves.toMatchObject({ id: 'product-not-a-uuid' })
      await local.close()
    })

    it('rejects non-uuid customers.id on SupabaseAdapter; LocalAdapter accepts it', async () => {
      const bad = customerFixture({ id: 'customer-not-a-uuid' })
      const sb = await supabaseAdapter()
      await expect(sb.createCustomer(bad)).rejects.toThrow(/invalid input syntax for type uuid/)

      const local = await localAdapter()
      await expect(local.createCustomer(bad)).resolves.toMatchObject({ id: 'customer-not-a-uuid' })
      await local.close()
    })

    it('rejects non-uuid orders.id on SupabaseAdapter; LocalAdapter accepts it', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      const bad = orderFixture({ id: 'order-not-a-uuid', items: [] })
      await expect(sb.createOrder(bad)).rejects.toThrow(/invalid input syntax for type uuid/)

      const local = await localAdapter()
      await local.createCustomer(customerFixture())
      await expect(local.createOrder(orderFixture({ id: 'order-not-a-uuid', items: [] }))).resolves.toMatchObject({
        id: 'order-not-a-uuid',
      })
      await local.close()
    })

    it('rejects non-uuid orders.customer_id on SupabaseAdapter', async () => {
      const sb = await supabaseAdapter()
      // customer_id is both uuid-typed and an FK; non-uuid fails uuid check first.
      await expect(
        sb.createOrder(orderFixture({ customerId: 'not-a-customer-uuid', items: [] })),
      ).rejects.toThrow(/invalid input syntax for type uuid/)
    })

    it('rejects non-uuid order_items.id on SupabaseAdapter; LocalAdapter accepts it', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createProduct(productFixture())
      await sb.createOrder(orderFixture({ items: [] }))
      await expect(
        sb.createOrderItem(itemFixture({ id: 'item-not-a-uuid' })),
      ).rejects.toThrow(/invalid input syntax for type uuid/)

      const local = await localAdapter()
      await local.createCustomer(customerFixture())
      await local.createOrder(orderFixture({ items: [] }))
      await expect(local.createOrderItem(itemFixture({ id: 'item-not-a-uuid' }))).resolves.toMatchObject({
        id: 'item-not-a-uuid',
      })
      await local.close()
    })

    it('rejects non-uuid order_items.order_id and product_id on SupabaseAdapter', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createOrderItem(itemFixture({ orderId: 'order-not-uuid', productId: PRODUCT_ID })),
      ).rejects.toThrow(/invalid input syntax for type uuid/)
      await expect(
        sb.createOrderItem(itemFixture({ orderId: ORDER_ID, productId: 'product-not-uuid' })),
      ).rejects.toThrow(/invalid input syntax for type uuid/)
    })

    it('rejects non-uuid settings.id on direct insert (settings bug class)', async () => {
      // SupabaseAdapter.setSetting omits id on insert (toNewSetting); the guard still
      // fires if a non-uuid id is supplied through the client insert path.
      const { error } = await fake.client
        .from('settings')
        .insert({ id: 'settings-1753123456789', key: 'bad-id-key', value: {} })
        .select()
        .single()
      expect(error?.message).toMatch(/invalid input syntax for type uuid/)
    })
  })

  // ── Unseeded products class ──────────────────────────────────────────────

  describe('unseeded products (ensureCatalogProducts)', () => {
    it('back-fills all six catalog drinks on SupabaseAdapter with zero products rows', async () => {
      const sb = await supabaseAdapter()
      expect(await sb.listProducts()).toHaveLength(0)
      const byName = await ensureCatalogProducts(sb)
      expect(byName.size).toBe(CATALOG_COUNT)
      expect(await sb.listProducts()).toHaveLength(CATALOG_COUNT)
      for (const name of Object.values(PRODUCT_CATALOG).map((p) => p.name)) {
        expect(byName.has(name)).toBe(true)
      }
    })

    it('lets an order persist with a valid order_items.product_id FK after ensureCatalogProducts', async () => {
      const sb = await supabaseAdapter()
      expect(await sb.listProducts()).toHaveLength(0)
      const byName = await ensureCatalogProducts(sb)
      const matcha = byName.get('Matcha Latte')!
      expect(matcha.id).toMatch(UUID)

      await sb.createCustomer(customerFixture())
      const item = itemFixture({ productId: matcha.id, productName: matcha.name })
      const order = orderFixture({ items: [item] })
      const saved = await sb.createOrder(order)
      expect(saved.items[0].productId).toBe(matcha.id)
      expect(await sb.getOrderItem(item.id)).toMatchObject({ productId: matcha.id })
    })

    it('same ensureCatalogProducts path works on an emptied LocalAdapter', async () => {
      const local = await localWithNoProducts()
      const byName = await ensureCatalogProducts(local)
      expect(byName.size).toBe(CATALOG_COUNT)
      const matcha = byName.get('Matcha Latte')!
      await local.createCustomer(customerFixture())
      const item = itemFixture({ productId: matcha.id })
      const saved = await local.createOrder(orderFixture({ items: [item] }))
      expect(saved.items[0].productId).toBe(matcha.id)
      await local.close()
    })
  })

  // ── Enum order_status ────────────────────────────────────────────────────

  describe('orders.status enum', () => {
    const validStatuses: OrderStatus[] = ['new', 'paid', 'delivered', 'cancelled']

    it.each(validStatuses)('persists valid status %s on SupabaseAdapter', async (status) => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      const paymentReceived = status === 'new' ? false : status === 'cancelled' ? false : true
      const order = orderFixture({
        id: `70000000-0000-4000-8000-0000000000${status === 'new' ? '10' : status === 'paid' ? '11' : status === 'delivered' ? '12' : '13'}`,
        status,
        paymentReceived,
        items: [],
      })
      const saved = await sb.createOrder(order)
      expect(saved.status).toBe(status)
      expect((await sb.getOrder(order.id))?.status).toBe(status)
    })

    it('rejects an invalid status on SupabaseAdapter', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ status: 'shipped' as OrderStatus, items: [] })),
      ).rejects.toThrow(/invalid input value for enum order_status/)
    })

    it('LocalAdapter accepts an invalid status (permissive divergence)', async () => {
      const local = await localAdapter()
      await local.createCustomer(customerFixture())
      await expect(
        local.createOrder(orderFixture({ status: 'shipped' as OrderStatus, items: [] })),
      ).resolves.toMatchObject({ status: 'shipped' })
      await local.close()
    })
  })

  // ── orders_status_payment_consistent ─────────────────────────────────────

  describe('orders_status_payment_consistent', () => {
    it('rejects new + paymentReceived: true', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ status: 'new', paymentReceived: true, items: [] })),
      ).rejects.toThrow(/orders_status_payment_consistent/)
    })

    it('rejects paid + paymentReceived: false', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ status: 'paid', paymentReceived: false, items: [] })),
      ).rejects.toThrow(/orders_status_payment_consistent/)
    })

    it('rejects delivered + paymentReceived: false', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ status: 'delivered', paymentReceived: false, items: [] })),
      ).rejects.toThrow(/orders_status_payment_consistent/)
    })

    it('accepts cancelled with paymentReceived true or false', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      const a = await sb.createOrder(
        orderFixture({
          id: '70000000-0000-4000-8000-000000000021',
          status: 'cancelled',
          paymentReceived: false,
          items: [],
        }),
      )
      const b = await sb.createOrder(
        orderFixture({
          id: '70000000-0000-4000-8000-000000000022',
          status: 'cancelled',
          paymentReceived: true,
          items: [],
        }),
      )
      expect(a.status).toBe('cancelled')
      expect(b.paymentReceived).toBe(true)
    })
  })

  // ── NOT NULL (full schema set for tables the suite covers) ───────────────

  describe('NOT NULL rejections', () => {
    it('customers: rejects null name', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createCustomer(customerFixture({ name: null as unknown as string })),
      ).rejects.toThrow(/null value in column "name"/)
    })

    it('products: rejects null name', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createProduct(productFixture({ name: null as unknown as string })),
      ).rejects.toThrow(/null value in column "name"/)
    })

    it('products: rejects null price_centavos', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createProduct(productFixture({ priceCentavos: null as unknown as number })),
      ).rejects.toThrow(/null value in column "price_centavos"/)
    })

    it('products: rejects null active', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createProduct(productFixture({ active: null as unknown as boolean })),
      ).rejects.toThrow(/null value in column "active"/)
    })

    it('orders: rejects null customer_id', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createOrder(orderFixture({ customerId: null as unknown as string, items: [] })),
      ).rejects.toThrow(/null value in column "customer_id"/)
    })

    it('orders: rejects null status', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ status: null as unknown as OrderStatus, items: [] })),
      ).rejects.toThrow(/null value in column "status"/)
    })

    it('orders: rejects null payment_received', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ paymentReceived: null as unknown as boolean, items: [] })),
      ).rejects.toThrow(/null value in column "payment_received"/)
    })

    it('orders: rejects null subtotal_centavos', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ subtotalCentavos: null as unknown as number, items: [] })),
      ).rejects.toThrow(/null value in column "subtotal_centavos"/)
    })

    it('orders: rejects null delivery_fee_centavos', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ deliveryFeeCentavos: null as unknown as number, items: [] })),
      ).rejects.toThrow(/null value in column "delivery_fee_centavos"/)
    })

    it('orders: rejects null total_centavos', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ totalCentavos: null as unknown as number, items: [] })),
      ).rejects.toThrow(/null value in column "total_centavos"/)
    })

    it('orders: rejects null raw_source', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ rawSource: null as unknown as string, items: [] })),
      ).rejects.toThrow(/null value in column "raw_source"/)
    })

    it('order_items: rejects null order_id', async () => {
      const sb = await supabaseAdapter()
      await sb.createProduct(productFixture())
      await expect(
        sb.createOrderItem(itemFixture({ orderId: null as unknown as string })),
      ).rejects.toThrow(/null value in column "order_id"/)
    })

    it('order_items: rejects null product_id', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createOrder(orderFixture({ items: [] }))
      await expect(
        sb.createOrderItem(itemFixture({ productId: null as unknown as string })),
      ).rejects.toThrow(/null value in column "product_id"/)
    })

    it('order_items: rejects null product_name_snapshot', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createProduct(productFixture())
      await sb.createOrder(orderFixture({ items: [] }))
      await expect(
        sb.createOrderItem(itemFixture({ productName: null as unknown as string })),
      ).rejects.toThrow(/null value in column "product_name_snapshot"/)
    })

    it('order_items: rejects null quantity', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createProduct(productFixture())
      await sb.createOrder(orderFixture({ items: [] }))
      await expect(
        sb.createOrderItem(itemFixture({ quantity: null as unknown as number })),
      ).rejects.toThrow(/null value in column "quantity"/)
    })

    it('order_items: rejects null modifiers', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createProduct(productFixture())
      await sb.createOrder(orderFixture({ items: [] }))
      await expect(
        sb.createOrderItem(itemFixture({ modifiers: null as unknown as StoredOrderItem['modifiers'] })),
      ).rejects.toThrow(/null value in column "modifiers"/)
    })

    it('order_items: rejects null unit_price_centavos', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createProduct(productFixture())
      await sb.createOrder(orderFixture({ items: [] }))
      await expect(
        sb.createOrderItem(itemFixture({ unitPriceCentavos: null as unknown as number })),
      ).rejects.toThrow(/null value in column "unit_price_centavos"/)
    })

    it('order_items: rejects null line_total_centavos', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createProduct(productFixture())
      await sb.createOrder(orderFixture({ items: [] }))
      await expect(
        sb.createOrderItem(itemFixture({ lineTotalCentavos: null as unknown as number })),
      ).rejects.toThrow(/null value in column "line_total_centavos"/)
    })

    it('settings: rejects insert missing key', async () => {
      const { error } = await fake.client.from('settings').insert({ value: {} }).select().single()
      expect(error?.message).toMatch(/null value in column "key"/)
    })

    it('settings: rejects insert missing value', async () => {
      const { error } = await fake.client.from('settings').insert({ key: 'no-value-key' }).select().single()
      expect(error?.message).toMatch(/null value in column "value"/)
    })

    it('modifier_groups: rejects null name', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createModifierGroup({
          id: '20000000-0000-4000-8000-000000000001',
          name: null as unknown as string,
          appliesToProductIds: [],
          options: [],
          allowsMultiple: false,
          createdAt,
          updatedAt: createdAt,
        }),
      ).rejects.toThrow(/null value in column "name"/)
    })

    it('modifier_groups: rejects null applies_to_product_ids', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createModifierGroup({
          id: '20000000-0000-4000-8000-000000000002',
          name: 'Sweetness',
          appliesToProductIds: null as unknown as string[],
          options: [],
          allowsMultiple: false,
          createdAt,
          updatedAt: createdAt,
        }),
      ).rejects.toThrow(/null value in column "applies_to_product_ids"/)
    })

    it('modifier_groups: rejects null options', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createModifierGroup({
          id: '20000000-0000-4000-8000-000000000003',
          name: 'Sweetness',
          appliesToProductIds: [],
          options: null as unknown as [],
          allowsMultiple: false,
          createdAt,
          updatedAt: createdAt,
        }),
      ).rejects.toThrow(/null value in column "options"/)
    })

    it('modifier_groups: rejects null allows_multiple', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createModifierGroup({
          id: '20000000-0000-4000-8000-000000000004',
          name: 'Sweetness',
          appliesToProductIds: [],
          options: [],
          allowsMultiple: null as unknown as boolean,
          createdAt,
          updatedAt: createdAt,
        }),
      ).rejects.toThrow(/null value in column "allows_multiple"/)
    })
  })

  // ── CHECK constraints (full money + quantity set from schema.sql) ────────

  describe('CHECK constraints', () => {
    it('products: rejects negative price_centavos', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createProduct(productFixture({ priceCentavos: -1 })),
      ).rejects.toThrow(/products_price_centavos_check/)
    })

    it('order_items: rejects quantity <= 0', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createProduct(productFixture())
      await sb.createOrder(orderFixture({ items: [] }))
      await expect(
        sb.createOrderItem(itemFixture({ quantity: 0 })),
      ).rejects.toThrow(/order_items_quantity_check/)
    })

    it('order_items: rejects negative unit_price_centavos', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createProduct(productFixture())
      await sb.createOrder(orderFixture({ items: [] }))
      await expect(
        sb.createOrderItem(itemFixture({ unitPriceCentavos: -1 })),
      ).rejects.toThrow(/order_items_unit_price_centavos_check/)
    })

    it('order_items: rejects negative line_total_centavos', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createProduct(productFixture())
      await sb.createOrder(orderFixture({ items: [] }))
      await expect(
        sb.createOrderItem(itemFixture({ lineTotalCentavos: -1 })),
      ).rejects.toThrow(/order_items_line_total_centavos_check/)
    })

    it('orders: rejects negative subtotal_centavos', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ subtotalCentavos: -1, items: [] })),
      ).rejects.toThrow(/orders_subtotal_centavos_check/)
    })

    it('orders: rejects negative delivery_fee_centavos', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ deliveryFeeCentavos: -1, items: [] })),
      ).rejects.toThrow(/orders_delivery_fee_centavos_check/)
    })

    it('orders: rejects negative total_centavos', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(
        sb.createOrder(orderFixture({ totalCentavos: -1, items: [] })),
      ).rejects.toThrow(/orders_total_centavos_check/)
    })
  })

  // ── Foreign keys ─────────────────────────────────────────────────────────

  describe('foreign key presence', () => {
    it('rejects an order referencing an absent customer', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createOrder(orderFixture({ customerId: '70000000-0000-4000-8000-000000000099', items: [] })),
      ).rejects.toThrow(/violates foreign key constraint "orders_customer_id_fkey"/)
    })

    it('rejects an order item referencing an absent order', async () => {
      const sb = await supabaseAdapter()
      await sb.createProduct(productFixture())
      await expect(
        sb.createOrderItem(itemFixture({ orderId: '70000000-0000-4000-8000-000000000099' })),
      ).rejects.toThrow(/violates foreign key constraint "order_items_order_id_fkey"/)
    })

    it('rejects an order item referencing an absent product', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createOrder(orderFixture({ items: [] }))
      await expect(
        sb.createOrderItem(itemFixture({ productId: '10000000-0000-4000-8000-000000000099' })),
      ).rejects.toThrow(/violates foreign key constraint "order_items_product_id_fkey"/)
    })
  })

  // ── ON DELETE CASCADE (order_items.order_id → orders) ─────────────────────

  describe('ON DELETE CASCADE order_items', () => {
    it('deleting an order removes its order_items rows', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createProduct(productFixture())
      await sb.createOrder(orderFixture())
      expect(await sb.getOrderItem(ITEM_ID)).not.toBeNull()
      await sb.deleteOrder(ORDER_ID)
      expect(await sb.getOrder(ORDER_ID)).toBeNull()
      expect(await sb.getOrderItem(ITEM_ID)).toBeNull()
      expect(fake.tables.order_items ?? []).toHaveLength(0)
    })
  })

  // ── settings uniqueness + insert-without-id ──────────────────────────────

  describe('settings', () => {
    it('inserts without a client id and mints a uuid', async () => {
      const sb = await supabaseAdapter()
      const setting: Setting = {
        id: 'client-will-omit-this',
        key: 'parity_dispatch_cutoff',
        value: '17:00',
        createdAt,
        updatedAt: createdAt,
      }
      const saved = await sb.setSetting(setting)
      expect(fake.inserts).toHaveLength(1)
      expect(fake.inserts[0]).not.toHaveProperty('id')
      expect(saved.id).toMatch(UUID)
      expect(saved.key).toBe('parity_dispatch_cutoff')
      expect(saved.value).toBe('17:00')
    })

    it('updates in place on second setSetting with the same key (no second insert)', async () => {
      const sb = await supabaseAdapter()
      const first = await sb.setSetting({
        id: SETTING_ID,
        key: 'parity_unique_key',
        value: 1,
        createdAt,
        updatedAt: createdAt,
      })
      const second = await sb.setSetting({
        id: '70000000-0000-4000-8000-000000000099',
        key: 'parity_unique_key',
        value: 2,
        createdAt,
        updatedAt: createdAt,
      })
      expect(fake.inserts).toHaveLength(1)
      expect(fake.tables.settings).toHaveLength(1)
      expect(second.id).toBe(first.id)
      expect(second.value).toBe(2)
    })

    it('rejects a raw second insert with the same settings.key (unique constraint)', async () => {
      const sb = await supabaseAdapter()
      await sb.setSetting({
        id: SETTING_ID,
        key: 'parity_dup_key',
        value: 'a',
        createdAt,
        updatedAt: createdAt,
      })
      const { error } = await fake.client
        .from('settings')
        .insert({ key: 'parity_dup_key', value: 'b' })
        .select()
        .single()
      expect(error?.message).toMatch(/duplicate key value violates unique constraint/)
    })
  })

  // ── modifier_groups uuid (guard present in fake; table outside four-table core) ─

  describe('modifier_groups uuid', () => {
    it('rejects non-uuid modifier_groups.id on SupabaseAdapter', async () => {
      const sb = await supabaseAdapter()
      await expect(
        sb.createModifierGroup({
          id: 'group-not-a-uuid',
          name: 'Sweetness',
          appliesToProductIds: [],
          options: [],
          allowsMultiple: false,
          createdAt,
          updatedAt: createdAt,
        }),
      ).rejects.toThrow(/invalid input syntax for type uuid/)
    })
  })

  // ── Primary key uniqueness ───────────────────────────────────────────────

  describe('primary key uniqueness', () => {
    it('rejects a second products row with the same id', async () => {
      const sb = await supabaseAdapter()
      await sb.createProduct(productFixture())
      await expect(sb.createProduct(productFixture({ name: 'Duplicate Id Drink' }))).rejects.toThrow(
        /duplicate key value violates unique constraint "products_pkey"/,
      )
    })

    it('rejects a second customers row with the same id', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await expect(sb.createCustomer(customerFixture({ name: 'Dup' }))).rejects.toThrow(
        /duplicate key value violates unique constraint "customers_pkey"/,
      )
    })
  })

  // ── nullable columns must remain nullable (anti over-constraint) ─────────

  describe('nullable columns stay nullable', () => {
    it('customers.phone may be null', async () => {
      const sb = await supabaseAdapter()
      const saved = await sb.createCustomer(customerFixture({ phone: null }))
      expect(saved.phone).toBeNull()
    })

    it('orders.delivery_date, address_snapshot, notes, route_position may be null', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      const saved = await sb.createOrder(
        orderFixture({
          deliveryDate: null,
          addressSnapshot: null,
          notes: null,
          routePosition: null,
          items: [],
        }),
      )
      expect(saved.deliveryDate).toBeNull()
      expect(saved.addressSnapshot).toBeNull()
      expect(saved.notes).toBeNull()
      expect(saved.routePosition).toBeNull()
    })
  })

  // ── Server-managed timestamps on UPDATE (created_at / updated_at) ────────

  describe('server-managed timestamps on updateOrder', () => {
    it('omits created_at and updated_at from the raw UPDATE payload; preserves createdAt; server supplies updatedAt', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createProduct(productFixture())
      const created = await sb.createOrder(orderFixture())
      expect(created.createdAt).toBe(createdAt)
      expect(created.updatedAt).toBe(createdAt)

      // Ensure the trigger-emulated updated_at can differ from the fixture timestamps.
      await new Promise((resolve) => setTimeout(resolve, 5))

      const updated = await sb.updateOrder(ORDER_ID, {
        notes: 'gate code 1234',
        routePosition: 7,
        status: 'paid',
        paymentReceived: true,
        addressSnapshot: 'Walnut 33B',
      })

      // Raw PostgREST UPDATE payload must not include either server-managed column.
      expect(fake.updates).toHaveLength(1)
      const payload = fake.updates[0]
      expect(payload).not.toHaveProperty('created_at')
      expect(payload).not.toHaveProperty('updated_at')
      // Representative editable fields still present on the outbound payload.
      expect(payload).toMatchObject({
        id: ORDER_ID,
        notes: 'gate code 1234',
        route_position: 7,
        status: 'paid',
        payment_received: true,
        address_snapshot: 'Walnut 33B',
      })

      // Persisted / returned order keeps original createdAt; updatedAt comes from the fake trigger.
      expect(updated.createdAt).toBe(createdAt)
      expect(updated.updatedAt).not.toBe(createdAt)
      expect(updated.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(updated.notes).toBe('gate code 1234')
      expect(updated.routePosition).toBe(7)
      expect(updated.status).toBe('paid')
      expect(updated.paymentReceived).toBe(true)
      expect(updated.addressSnapshot).toBe('Walnut 33B')

      const reread = await sb.getOrder(ORDER_ID)
      expect(reread?.createdAt).toBe(createdAt)
      expect(reread?.updatedAt).toBe(updated.updatedAt)
      expect(reread?.notes).toBe('gate code 1234')
      expect(reread?.routePosition).toBe(7)
    })
  })

  // ── Change-event payload parity ──────────────────────────────────────────

  describe('change-event payloads', () => {
    /** Seed a customer, product and one order with a single item on the Supabase adapter. */
    async function seededSupabase() {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())
      await sb.createProduct(productFixture())
      await sb.createOrder(orderFixture({ items: [itemFixture()] }))
      return sb
    }

    it('orders: a realtime INSERT event carries the order items, matching LocalAdapter', async () => {
      const sb = await seededSupabase()
      const changes: StorageChange[] = []
      const unsubscribe = sb.subscribe((change) => { changes.push(change) })

      await fake.emit('orders', 'INSERT', fake.tables.orders[0])

      const orderChange = changes.find((change) => change.collection === 'orders')
      expect(orderChange?.operation).toBe('insert')
      const entity = orderChange?.entity as StoredOrder
      expect(entity.id).toBe(ORDER_ID)
      expect(entity.items).toHaveLength(1)
      expect(entity.items[0]).toMatchObject({ id: ITEM_ID, orderId: ORDER_ID, quantity: 1 })
      unsubscribe()

      // LocalAdapter emits the stored order, which carries its items inline.
      const local = await localAdapter()
      const localChanges: StorageChange[] = []
      const localUnsubscribe = local.subscribe((change) => { localChanges.push(change) })
      await local.createOrder(orderFixture({ items: [itemFixture()] }))
      const localOrderChange = localChanges.find((change) => change.collection === 'orders')
      expect(localOrderChange).toBeDefined()
      expect((localOrderChange!.entity as StoredOrder).items).toHaveLength(1)
      localUnsubscribe()
      await local.close()
    })

    it('orders: a realtime UPDATE event carries the order items', async () => {
      const sb = await seededSupabase()
      await sb.updateOrder(ORDER_ID, { status: 'paid', paymentReceived: true })

      const changes: StorageChange[] = []
      const unsubscribe = sb.subscribe((change) => { changes.push(change) })
      await fake.emit('orders', 'UPDATE', fake.tables.orders[0])

      const orderChange = changes.find((change) => change.collection === 'orders')
      expect(orderChange).toBeDefined()
      const entity = orderChange!.entity as StoredOrder
      expect(entity.status).toBe('paid')
      expect(entity.items).toHaveLength(1)
      expect(entity.items[0].id).toBe(ITEM_ID)
      unsubscribe()
    })

    it('orders: a realtime DELETE event emits no items, because the rows are already gone', async () => {
      const sb = await seededSupabase()
      const row = { ...fake.tables.orders[0] }
      await sb.deleteOrder(ORDER_ID)

      const changes: StorageChange[] = []
      const unsubscribe = sb.subscribe((change) => { changes.push(change) })
      await fake.emit('orders', 'DELETE', row)

      const change = changes.find((c) => c.collection === 'orders')
      expect(change).toBeDefined()
      expect(change!.operation).toBe('delete')
      expect((change!.entity as StoredOrder).items).toEqual([])
      unsubscribe()
    })

    it('non-order tables still emit synchronously from the realtime payload alone', async () => {
      const sb = await supabaseAdapter()
      await sb.createCustomer(customerFixture())

      const changes: StorageChange[] = []
      const unsubscribe = sb.subscribe((change) => { changes.push(change) })
      await fake.emit('customers', 'UPDATE', fake.tables.customers[0])

      const change = changes.find((c) => c.collection === 'customers')
      expect(change?.operation).toBe('update')
      expect(change?.entity).toMatchObject({ id: CUSTOMER_ID, name: 'Test Customer' })
      unsubscribe()
    })
  })
})
