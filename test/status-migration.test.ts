import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260728000000_simplify_order_statuses.sql')
const migration = readFileSync(migrationPath, 'utf8')

describe('production order-status migration', () => {
  it('runs atomically under an exclusive orders lock', () => {
    expect(migration.trimStart()).toMatch(/^begin;/)
    expect(migration).toContain('lock table public.orders in access exclusive mode;')
    expect(migration.trimEnd()).toMatch(/commit;$/)
  })

  it.each([
    ["when 'new' then 'new'"],
    ["when 'confirmed' then case when payment_received then 'paid' else 'new' end"],
    ["when 'paid' then 'paid'"],
    ["when 'making' then 'paid'"],
    ["when 'out_for_delivery' then 'paid'"],
    ["when 'delivered' then 'delivered'"],
    ["when 'cancelled' then 'cancelled'"],
  ])('contains legacy mapping %s', (mapping) => {
    expect(migration).toContain(mapping)
  })

  it('fails and rolls back if order facts or allowed statuses change unexpectedly', () => {
    for (const invariant of [
      'Order count changed during status migration',
      'Order subtotal changed during status migration',
      'Delivery fee total changed during status migration',
      'Order total changed during status migration',
      'Order item count changed during status migration',
      'Order timestamp changed during status migration',
      'Legacy order status remains after migration',
    ]) expect(migration).toContain(invariant)
  })

  it('normalizes and constrains payment state without rewriting order timestamps', () => {
    expect(migration).toContain('disable trigger orders_set_updated_at;')
    expect(migration).toContain('enable trigger orders_set_updated_at;')
    expect(migration).toContain('add constraint orders_status_payment_consistent check')
  })
})
