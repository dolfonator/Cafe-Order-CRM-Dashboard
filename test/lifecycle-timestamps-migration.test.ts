import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260728010000_add_order_lifecycle_timestamps.sql')
const migration = readFileSync(migrationPath, 'utf8')

describe('order lifecycle-timestamps migration', () => {
  it('runs atomically under an exclusive orders lock', () => {
    // Header comments are required; transaction opens with begin; after them.
    expect(migration).toMatch(/(^|\n)begin;\n/)
    expect(migration).toContain('lock table public.orders in access exclusive mode;')
    expect(migration.trimEnd()).toMatch(/commit;$/)
  })

  it.each([
    ["when status = 'new' then null"],
    ["when status = 'paid' then updated_at"],
    ["when status = 'delivered' then updated_at"],
    ["when status = 'cancelled' and payment_received = true then updated_at"],
    ["when status = 'cancelled' and payment_received = false then null"],
  ])('contains backfill branch %s', (branch) => {
    expect(migration).toContain(branch)
  })

  it('disables and re-enables orders_set_updated_at around the backfill', () => {
    expect(migration).toContain('disable trigger orders_set_updated_at;')
    expect(migration).toContain('enable trigger orders_set_updated_at;')
    const disableIdx = migration.indexOf('disable trigger orders_set_updated_at;')
    const enableIdx = migration.indexOf('enable trigger orders_set_updated_at;')
    const backfillIdx = migration.indexOf("when status = 'paid' then updated_at")
    expect(disableIdx).toBeGreaterThan(-1)
    expect(enableIdx).toBeGreaterThan(disableIdx)
    expect(backfillIdx).toBeGreaterThan(disableIdx)
    expect(backfillIdx).toBeLessThan(enableIdx)
  })

  it('fails and rolls back if order facts or lifecycle rules change unexpectedly', () => {
    for (const invariant of [
      'Order count changed during lifecycle timestamps migration',
      'Order subtotal changed during lifecycle timestamps migration',
      'Delivery fee total changed during lifecycle timestamps migration',
      'Order total changed during lifecycle timestamps migration',
      'Order item count changed during lifecycle timestamps migration',
      'Order timestamp changed during lifecycle timestamps migration',
      'Payment/status consistency violated during lifecycle timestamps migration',
      'Lifecycle timestamps inconsistent after migration',
    ]) expect(migration).toContain(invariant)
  })

  it('creates the lifecycle timestamp trigger function and before insert or update trigger', () => {
    expect(migration).toContain('create function public.set_order_lifecycle_timestamps()')
    expect(migration).toContain('before insert or update on public.orders')
    expect(migration).toContain('execute function public.set_order_lifecycle_timestamps()')
  })

  it('adds the lifecycle timestamps CHECK constraint with all four status branches', () => {
    expect(migration).toContain('add constraint orders_lifecycle_timestamps_consistent check')
    expect(migration).toContain("status = 'new' and paid_at is null and delivered_at is null")
    expect(migration).toContain("status = 'paid' and paid_at is not null and delivered_at is null")
    expect(migration).toContain("status = 'delivered' and paid_at is not null and delivered_at is not null and paid_at <= delivered_at")
    expect(migration).toContain("status = 'cancelled' and delivered_at is null")
  })

  it('contains no destructive table operations', () => {
    expect(migration.toLowerCase()).not.toMatch(/\bdrop\s+table\b/)
    expect(migration.toLowerCase()).not.toMatch(/\btruncate\b/)
    expect(migration.toLowerCase()).not.toMatch(/\bdelete\s+from\b/)
  })
})
