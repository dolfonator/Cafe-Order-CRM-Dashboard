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
  const origFrom = fake.client.from
  fake.client.from = ((table: string) => {
    const api = origFrom(table)
    const origSelect = api.select.bind(api)
    api.select = () => {
      const builder = origSelect()
      const origEq = builder.eq.bind(builder)
      const origMaybe = builder.maybeSingle.bind(builder)
      builder.eq = (column: string, value: unknown) => {
        eqs.push({ table, column, value, maybeSingle: false })
        return origEq(column, value)
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
  return { eqs, restore: () => { fake.client.from = origFrom } }
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
