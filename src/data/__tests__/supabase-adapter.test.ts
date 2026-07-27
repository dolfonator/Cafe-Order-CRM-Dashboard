import { describe, expect, it, vi, beforeEach } from 'vitest'

// A fake postgrest client that enforces the one schema rule this suite cares about:
// settings.id is a uuid column, so a non-uuid client-supplied id fails with 22P02
// exactly as Postgres does — the failure that made "Save settings" unusable in production.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Row = Record<string, unknown>

const tables: Record<string, Row[]> = {}
const inserts: Row[] = []

function result(data: unknown, error: { message: string } | null = null) {
  const payload = { data, error }
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve(payload),
    maybeSingle: () => Promise.resolve(payload),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(payload).then(resolve),
  }
  return builder
}

function fakeClient() {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => ({
      select: () => result(tables[table] ?? []),
      insert: (value: Row) => {
        inserts.push(value)
        if ('id' in value && !UUID.test(String(value.id))) {
          return result(null, { message: `invalid input syntax for type uuid: "${String(value.id)}"` })
        }
        const row = { id: value.id ?? '90000000-0000-4000-8000-000000000001', ...value }
        tables[table] = [...(tables[table] ?? []), row]
        return result(row)
      },
      update: (value: Row) => {
        const rows = tables[table] ?? []
        const next = { ...rows[0], ...value }
        tables[table] = [next]
        return result(next)
      },
      delete: () => result(null),
    }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }), subscribe: () => undefined }),
    removeChannel: () => Promise.resolve(),
    removeAllChannels: () => Promise.resolve(),
  }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient() }))

const { SupabaseAdapter } = await import('../supabase-adapter')
const { saveDashboardSettings, DEFAULT_DASHBOARD_SETTINGS, ORDER_DASHBOARD_SETTINGS_KEY } = await import('../../features/settings/settings-store')
const { saveCustomerProfile, customerProfileKey } = await import('../../features/customers/customer-profile')

describe('SupabaseAdapter settings writes', () => {
  beforeEach(() => {
    for (const key of Object.keys(tables)) delete tables[key]
    inserts.length = 0
  })

  it('saves dashboard settings on a table with no existing row', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    const saved = await saveDashboardSettings(adapter, { ...DEFAULT_DASHBOARD_SETTINGS, gCashNumber: '09170000000' })
    expect(saved.gCashNumber).toBe('09170000000')
    expect(tables.settings).toHaveLength(1)
  })

  it('never sends a client-generated id when inserting a settings row', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    await saveDashboardSettings(adapter, DEFAULT_DASHBOARD_SETTINGS)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).not.toHaveProperty('id')
    expect(inserts[0].key).toBe(ORDER_DASHBOARD_SETTINGS_KEY)
  })

  it('updates the existing row in place on a second save, keeping its database id', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    await saveDashboardSettings(adapter, DEFAULT_DASHBOARD_SETTINGS)
    await saveDashboardSettings(adapter, { ...DEFAULT_DASHBOARD_SETTINGS, businessName: 'Gelly' })
    expect(inserts).toHaveLength(1)
    expect(tables.settings).toHaveLength(1)
    expect(tables.settings[0].id).toBe('90000000-0000-4000-8000-000000000001')
  })

  it('saves a customer profile, whose key is not a uuid', async () => {
    const adapter = await SupabaseAdapter.create('https://example.supabase.co', 'anon-key')
    const customerId = '70000000-0000-4000-8000-000000000001'
    const saved = await saveCustomerProfile(adapter, customerId, { notes: 'likes oat milk', address: '', preferences: '' })
    expect(saved.key).toBe(customerProfileKey(customerId))
    expect(inserts[0]).not.toHaveProperty('id')
  })
})
