import { describe, expect, it, vi } from 'vitest'
import { LocalAdapter, resetLocalAdapterMemoryForTests } from '../../../data/local-adapter'
import { demoOrders } from '../../../demo/seed'
import * as pricing from '../../../domain/pricing'
import { applyCustomerMatch } from '../customer-matching'
import { normalizeCandidate } from '../parser'
import { confirmImportDraft } from '../persist'
import { priceDraftItems } from '../priceDraftItems'
import { saveOrderEdit } from '../../order-editor/saveOrderEdit'
import { storedOrderToImportDraft } from '../../order-editor/orderDraftMapping'
import { ensureCatalogProducts } from '../../../data/ensure-catalog-products'
import type { ImportDraft } from '../types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('priceDraftItems', () => {
  it('prices through priceOrder, zips cup names, and mints uuid item ids', async () => {
    resetLocalAdapterMemoryForTests()
    const adapter = await LocalAdapter.create()
    const productByName = await ensureCatalogProducts(adapter)
    const timestamp = '2026-08-30T00:00:00.000Z'
    const orderId = crypto.randomUUID()

    const spy = vi.spyOn(pricing, 'priceOrder')
    const { priced, items } = priceDraftItems({
      items: [{
        id: 'item-1',
        productSlug: 'matcha-latte',
        quantity: 2,
        level: 1,
        powder: 'yumeno',
        cupNames: ['Ana', 'Ben'],
      }],
      thermalBags: [],
      productByName,
      orderId,
      timestamp,
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(priced.totals.totalCentavos).toBe(40000)
    expect(items).toHaveLength(1)
    expect(items[0].id).toMatch(UUID_RE)
    expect(items[0].orderId).toBe(orderId)
    expect(items[0].lineTotalCentavos).toBe(40000)
    expect(items[0].modifiers.cupNames).toEqual(['Ana', 'Ben'])
    expect(items[0].createdAt).toBe(timestamp)

    spy.mockRestore()
    await adapter.close()
  })

  it('ignores smuggled totals on the draft and is used by both persist and save', async () => {
    resetLocalAdapterMemoryForTests()
    const adapter = await LocalAdapter.create()
    const spy = vi.spyOn(pricing, 'priceOrder')

    const parsed = normalizeCandidate(
      { customer_name: 'Rina Reyes', items: [{ product_slug: 'matcha-latte', quantity: 2 }], address: 'Makati' },
      'raw',
    )
    const matched = applyCustomerMatch(parsed, await adapter.listCustomers(), await adapter.listOrders())
    const smuggled = { ...matched, totalCentavos: 1, subtotalCentavos: 1 } as ImportDraft & { totalCentavos: number }

    const created = await confirmImportDraft(adapter, smuggled)
    expect(created.totalCentavos).toBe(40000)
    expect(created.items[0].lineTotalCentavos).toBe(40000)
    expect(created.items[0].id).toMatch(UUID_RE)
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1)

    const afterImportCalls = spy.mock.calls.length
    const order = (await adapter.listOrders()).find((entry) => entry.id === demoOrders[0].id)!
    const draft = storedOrderToImportDraft(order, 'Mika Santos')
    const edited = { ...draft, items: [{ ...draft.items[0], quantity: 5 }], totalCentavos: 1 } as ImportDraft & { totalCentavos: number }
    const saved = await saveOrderEdit(adapter, order, edited)

    expect(spy.mock.calls.length).toBeGreaterThan(afterImportCalls)
    expect(saved.subtotalCentavos).toBe(100000)
    expect(saved.totalCentavos).toBe(saved.subtotalCentavos + saved.deliveryFeeCentavos)
    expect(saved.items[0].lineTotalCentavos).toBe(100000)

    spy.mockRestore()
    await adapter.close()
  })
})
