import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createFakePostgrest, fakeCreateClient } from './fake-postgrest'

// Shared fake postgrest harness — schema rules live in fake-postgrest.ts.
// createFakePostgrest() installs the active instance that fakeCreateClient() returns.
const fake = createFakePostgrest()

// vi.mock must precede the top-level await import of supabase-adapter (load-bearing).
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeCreateClient() }))

const { SupabaseAdapter } = await import('../supabase-adapter')
const { saveDashboardSettings, DEFAULT_DASHBOARD_SETTINGS, ORDER_DASHBOARD_SETTINGS_KEY } = await import('../../features/settings/settings-store')
const { saveCustomerProfile, customerProfileKey } = await import('../../features/customers/customer-profile')

function interceptSelectEq() {
  const eqs: Array<{ table: string; column: string; value: unknown; maybeSingle: boolean }> = []
  const ins: Array<{ table: string; column: string; value: unknown }> = []
  const origFrom = fake.client.from
  fake.client.from = ((table: string) => {
    const api = origFrom(table)
    const origSelect = api.select.bind(api)
    api.select = () => {
      const builder = origSelect()
      const origEq = builder.eq.bind(builder)
      const origIn = builder.in.bind(builder)
      const origMaybe = builder.maybeSingle.bind(builder)
      builder.eq = (column: string, value: unknown) => {
        eqs.push({ table, column, value, maybeSingle: false })
        return origEq(column, value)
      }
      builder.in = (column: string, values: unknown[]) => {
        ins.push({ table, column, value: values })
        return origIn(column, values)
      }
      builder.maybeSingle = () => {
        const last = eqs[eqs.length - 1]
        if (last && last.table === table) last.maybeSingle = true
        return origMaybe()
      }
      return builder
    }
    return api
  }) as typeof fake.client.from
  return { eqs, ins, restore: () => { fake.client.from = origFrom } }
}

describe('SupabaseAdapter settings writes', () => {
  beforeEach(() => {
    fake.reset()
  })

  it('saves dashboard settings on a table with no existing row', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    const saved = await saveDashboardSettings(adapter, { ...DEFAULT_DASHBOARD_SETTINGS, gCashNumber: '09170000000' })
    expect(saved.gCashNumber).toBe('09170000000')
    expect(fake.tables.settings).toHaveLength(1)
  })

  it('never sends a client-generated id when inserting a settings row', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    await saveDashboardSettings(adapter, DEFAULT_DASHBOARD_SETTINGS)
    expect(fake.inserts).toHaveLength(1)
    expect(fake.inserts[0]).not.toHaveProperty('id')
    expect(fake.inserts[0].key).toBe(ORDER_DASHBOARD_SETTINGS_KEY)
  })

  it('updates the existing row in place on a second save, keeping its database id', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    await saveDashboardSettings(adapter, DEFAULT_DASHBOARD_SETTINGS)
    await saveDashboardSettings(adapter, { ...DEFAULT_DASHBOARD_SETTINGS, businessName: 'Gelly' })
    expect(fake.inserts).toHaveLength(1)
    expect(fake.tables.settings).toHaveLength(1)
    expect(fake.tables.settings[0].id).toBe('90000000-0000-4000-8000-000000000001')
  })

  it('saves a customer profile, whose key is not a uuid', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    const customerId = '70000000-0000-4000-8000-000000000001'
    const saved = await saveCustomerProfile(adapter, customerId, { notes: 'likes oat milk', address: '', preferences: '' })
    expect(saved.key).toBe(customerProfileKey(customerId))
    expect(fake.inserts[0]).not.toHaveProperty('id')
  })
})

describe('SupabaseAdapter query tightness', () => {
  beforeEach(() => {
    fake.reset()
  })

  it('scopes listOrders by delivery_date and loads items only for matching order ids', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    const createdAt = '2026-07-16T10:00:00.000Z'
    const customerId = '70000000-0000-4000-8000-000000000001'
    const productId = '10000000-0000-4000-8000-000000000001'
    const matchId = '70000000-0000-4000-8000-000000000003'
    const otherId = '70000000-0000-4000-8000-000000000013'
    await adapter.createCustomer({ id: customerId, name: 'Date Scope', phone: null, createdAt, updatedAt: createdAt })
    await adapter.createProduct({ id: productId, name: 'Matcha Latte', priceCentavos: 20000, active: true, createdAt, updatedAt: createdAt })
    await adapter.createOrder({
      id: matchId,
      customerId,
      status: 'new',
      items: [{
        id: '70000000-0000-4000-8000-000000000002',
        orderId: matchId,
        productId,
        productName: 'Matcha Latte',
        quantity: 1,
        modifiers: { level: 1, powder: 'yumeno', sweetness: 'regular' },
        unitPriceCentavos: 20000,
        lineTotalCentavos: 20000,
        createdAt,
        updatedAt: createdAt,
      }],
      subtotalCentavos: 20000,
      deliveryFeeCentavos: 2500,
      totalCentavos: 22500,
      deliveryDate: '2026-07-16',
      paymentReceived: false,
      rawSource: 'test',
      addressSnapshot: null,
      notes: null,
      routePosition: null,
      paidAt: null,
      deliveredAt: null,
      createdAt,
      updatedAt: createdAt,
    })
    await adapter.createOrder({
      id: otherId,
      customerId,
      status: 'new',
      items: [{
        id: '70000000-0000-4000-8000-000000000014',
        orderId: otherId,
        productId,
        productName: 'Matcha Latte',
        quantity: 1,
        modifiers: { level: 1, powder: 'yumeno', sweetness: 'regular' },
        unitPriceCentavos: 20000,
        lineTotalCentavos: 20000,
        createdAt,
        updatedAt: createdAt,
      }],
      subtotalCentavos: 20000,
      deliveryFeeCentavos: 2500,
      totalCentavos: 22500,
      deliveryDate: '2026-07-17',
      paymentReceived: false,
      rawSource: 'test',
      addressSnapshot: null,
      notes: null,
      routePosition: null,
      paidAt: null,
      deliveredAt: null,
      createdAt,
      updatedAt: createdAt,
    })

    const { eqs, ins, restore } = interceptSelectEq()
    try {
      const scoped = await adapter.listOrders({ deliveryDate: '2026-07-16' })
      expect(scoped).toHaveLength(1)
      expect(scoped[0].id).toBe(matchId)
      expect(eqs).toContainEqual({
        table: 'orders',
        column: 'delivery_date',
        value: '2026-07-16',
        maybeSingle: false,
      })
      expect(ins).toContainEqual({
        table: 'order_items',
        column: 'order_id',
        value: [matchId],
      })
      const unfiltered = await adapter.listOrders()
      expect(unfiltered).toHaveLength(2)
    } finally {
      restore()
    }
  })

  it('returns [] for a date with no orders without scanning order_items', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    const { eqs, ins, restore } = interceptSelectEq()
    try {
      const empty = await adapter.listOrders({ deliveryDate: '2099-01-01' })
      expect(empty).toEqual([])
      expect(eqs).toContainEqual({
        table: 'orders',
        column: 'delivery_date',
        value: '2099-01-01',
        maybeSingle: false,
      })
      expect(ins.filter((entry) => entry.table === 'order_items')).toHaveLength(0)
    } finally {
      restore()
    }
  })

  it('scalar updateOrder does not list order items', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    const createdAt = '2026-07-16T10:00:00.000Z'
    const customerId = '70000000-0000-4000-8000-000000000001'
    const productId = '10000000-0000-4000-8000-000000000001'
    const orderId = '70000000-0000-4000-8000-000000000003'
    await adapter.createCustomer({ id: customerId, name: 'Route', phone: null, createdAt, updatedAt: createdAt })
    await adapter.createProduct({ id: productId, name: 'Matcha Latte', priceCentavos: 20000, active: true, createdAt, updatedAt: createdAt })
    await adapter.createOrder({
      id: orderId,
      customerId,
      status: 'new',
      items: [{
        id: '70000000-0000-4000-8000-000000000002',
        orderId,
        productId,
        productName: 'Matcha Latte',
        quantity: 1,
        modifiers: { level: 1, powder: 'yumeno', sweetness: 'regular' },
        unitPriceCentavos: 20000,
        lineTotalCentavos: 20000,
        createdAt,
        updatedAt: createdAt,
      }],
      subtotalCentavos: 20000,
      deliveryFeeCentavos: 2500,
      totalCentavos: 22500,
      deliveryDate: '2026-07-16',
      paymentReceived: false,
      rawSource: 'test',
      addressSnapshot: null,
      notes: null,
      routePosition: null,
      paidAt: null,
      deliveredAt: null,
      createdAt,
      updatedAt: createdAt,
    })
    const spy = vi.spyOn(adapter, 'listOrderItems')
    const updated = await adapter.updateOrder(orderId, { routePosition: 4 })
    expect(updated.routePosition).toBe(4)
    expect(spy).not.toHaveBeenCalled()
    expect(fake.updates.at(-1)).not.toHaveProperty('paid_at')
    expect(fake.updates.at(-1)).not.toHaveProperty('delivered_at')
  })

  it('filters listOrderItems by order_id in PostgREST when orderId is provided', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    const { eqs, restore } = interceptSelectEq()
    try {
      await adapter.listOrderItems('70000000-0000-4000-8000-000000000003')
      expect(eqs).toContainEqual({
        table: 'order_items',
        column: 'order_id',
        value: '70000000-0000-4000-8000-000000000003',
        maybeSingle: false,
      })
    } finally {
      restore()
    }
  })

  it('reads the full order_items table when listOrderItems is called without an orderId', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    const { eqs, restore } = interceptSelectEq()
    try {
      await adapter.listOrderItems()
      expect(eqs.filter((eq) => eq.table === 'order_items')).toHaveLength(0)
    } finally {
      restore()
    }
  })

  it('loads a setting by key with maybeSingle rather than listing the table', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    const { eqs, restore } = interceptSelectEq()
    try {
      await adapter.getSetting(ORDER_DASHBOARD_SETTINGS_KEY)
      expect(eqs).toContainEqual({
        table: 'settings',
        column: 'key',
        value: ORDER_DASHBOARD_SETTINGS_KEY,
        maybeSingle: true,
      })
    } finally {
      restore()
    }
  })

  it('caches a successful getUser and does not cache a failed getUser', async () => {
    const getUser = vi.spyOn(fake.client.auth, 'getUser')
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'unauthenticated' } } as never)
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    await expect(adapter.listProducts()).rejects.toThrow('authenticated user')
    await adapter.listProducts()
    await adapter.listCustomers()
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('does not subscribe to modifier_groups realtime', async () => {
    const tables: string[] = []
    const origChannel = fake.client.channel.bind(fake.client)
    fake.client.channel = (() => {
      const channel = origChannel()
      const origOn = channel.on.bind(channel)
      channel.on = ((event: string, filter: { table: string }, handler: Parameters<typeof origOn>[2]) => {
        tables.push(filter.table)
        return origOn(event, filter, handler)
      }) as typeof channel.on
      return channel
    }) as typeof fake.client.channel
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    adapter.subscribe(() => undefined)
    expect(tables).toEqual(['products', 'customers', 'orders', 'order_items', 'settings'])
    expect(tables).not.toContain('modifier_groups')
  })
})
