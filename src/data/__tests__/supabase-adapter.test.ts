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
