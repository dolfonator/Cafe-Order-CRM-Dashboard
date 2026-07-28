import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalAdapter, resetLocalAdapterMemoryForTests } from '../../data/local-adapter'
import { demoOrders } from '../../demo/seed'
import { canAdvance, canCancel, nextStatus } from '../orders/orderLifecycle'
import { TodayBoard } from './TodayBoard'

const deliveryDate = '2026-07-16'
let adapters: LocalAdapter[] = []

beforeEach(() => {
  resetLocalAdapterMemoryForTests()
  adapters = []
})

afterEach(async () => {
  await Promise.all(adapters.map((adapter) => adapter.close()))
})

async function createAdapter(): Promise<LocalAdapter> {
  const adapter = await LocalAdapter.create()
  adapters.push(adapter)
  return adapter
}

describe('TodayBoard', () => {
  it('scopes orders by the selected delivery date', async () => {
    const adapter = await createAdapter()
    await adapter.updateOrder(demoOrders[1].id, { deliveryDate: '2026-07-17' })
    render(<TodayBoard adapter={adapter} initialDeliveryDate={deliveryDate} />)

    expect(await screen.findByRole('heading', { name: 'Mika Santos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Paolo Reyes' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Delivery date'), { target: { value: '2026-07-17' } })
    expect(await screen.findByRole('heading', { name: 'Paolo Reyes' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mika Santos' })).not.toBeInTheDocument()
  })

  it('persists New → Paid → Delivered and records payment automatically', async () => {
    const adapter = await createAdapter()
    await adapter.updateOrder(demoOrders[1].id, { status: 'new', paymentReceived: false })
    const user = userEvent.setup()
    render(<TodayBoard adapter={adapter} initialDeliveryDate={deliveryDate} />)

    const card = await screen.findByRole('heading', { name: 'Paolo Reyes' })
    expect(card).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mark Paid' }))
    await waitFor(async () => expect(await adapter.getOrder(demoOrders[1].id)).toMatchObject({ status: 'paid', paymentReceived: true }))
    const paoloCard = (await screen.findByRole('heading', { name: 'Paolo Reyes' })).closest('article')!
    await user.click(within(paoloCard).getByRole('button', { name: 'Mark Delivered' }))
    await waitFor(async () => expect((await adapter.getOrder(demoOrders[1].id))?.status).toBe('delivered'))
    expect(within((await screen.findByRole('heading', { name: 'Paolo Reyes' })).closest('article')!).queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('blocks invalid lifecycle transitions and makes cancellation terminal', () => {
    expect(nextStatus('delivered')).toBeNull()
    expect(canAdvance({ ...demoOrders[1], status: 'new', paymentReceived: false })).toBe(true)
    expect(canAdvance({ ...demoOrders[1], status: 'paid', paymentReceived: true })).toBe(true)
    for (const status of ['new', 'paid'] as const) expect(canCancel(status)).toBe(true)
    expect(canCancel('delivered')).toBe(false)
    expect(canCancel('cancelled')).toBe(false)
    expect(nextStatus('cancelled')).toBeNull()
  })

  it('cancels a non-delivered order and persists the terminal state', async () => {
    const adapter = await createAdapter()
    await adapter.updateOrder(demoOrders[1].id, { status: 'paid', paymentReceived: true })
    const user = userEvent.setup()
    render(<TodayBoard adapter={adapter} initialDeliveryDate={deliveryDate} />)

    const paoloCard = (await screen.findByRole('heading', { name: 'Paolo Reyes' })).closest('article')!
    await user.click(within(paoloCard).getByRole('button', { name: 'Cancel order' }))
    await waitFor(async () => expect(await adapter.getOrder(demoOrders[1].id)).toMatchObject({ status: 'cancelled', paymentReceived: true }))
    expect(within(await screen.findByRole('heading', { name: 'Paolo Reyes' }).then((heading) => heading.closest('article')!)).queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('persists accessible route reordering', async () => {
    const adapter = await createAdapter()
    const user = userEvent.setup()
    render(<TodayBoard adapter={adapter} initialDeliveryDate={deliveryDate} />)

    await user.click(screen.getByRole('button', { name: 'Run list' }))
    await screen.findByRole('heading', { name: 'Delivery run' })
    await user.click(screen.getByRole('button', { name: 'Move Paolo Reyes up' }))
    await waitFor(async () => {
      expect((await adapter.getOrder(demoOrders[1].id))?.routePosition).toBe(1)
      expect((await adapter.getOrder(demoOrders[0].id))?.routePosition).toBe(2)
    })
  })

  it('refreshes when another LocalAdapter session advances an order', async () => {
    const first = await createAdapter()
    const second = await createAdapter()
    render(<TodayBoard adapter={first} initialDeliveryDate={deliveryDate} />)
    expect(await screen.findByRole('button', { name: 'Mark Paid' })).toBeInTheDocument()

    await second.updateOrder(demoOrders[1].id, { status: 'paid', paymentReceived: true })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark Delivered' })).toBeInTheDocument())
  })

  it('creates a manual new order through the shared editor, persisted with engine-priced totals', async () => {
    const adapter = await createAdapter()
    const user = userEvent.setup()
    render(<TodayBoard adapter={adapter} initialDeliveryDate={deliveryDate} />)
    await screen.findByRole('heading', { name: 'Mika Santos' })

    await user.click(screen.getByRole('button', { name: 'New order' }))
    const dialog = await screen.findByRole('dialog', { name: 'New order' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Customer name' }), 'Jenna Cruz')
    await user.type(within(dialog).getByRole('textbox', { name: 'Address' }), 'Taguig City')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm order' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New order' })).not.toBeInTheDocument())
    const orders = await adapter.listOrders()
    const created = orders.find((order) => order.addressSnapshot === 'Taguig City')
    expect(created).toBeDefined()
    // The default drink row is one Matcha Latte, level 1, Yumeno — 20000 centavos per the demo catalog.
    // This value is asserted to prove the engine priced it, not any UI-supplied number.
    expect(created!.subtotalCentavos).toBe(20000)
    expect(created!.totalCentavos).toBe(20000)
    expect(created!.deliveryDate).toBe(deliveryDate)
  })

  it('edits an order through the shared editor, reprices via the engine, and leaves no orphan order_items', async () => {
    const adapter = await createAdapter()
    const user = userEvent.setup()
    render(<TodayBoard adapter={adapter} initialDeliveryDate={deliveryDate} />)

    const paoloCard = (await screen.findByRole('heading', { name: 'Paolo Reyes' })).closest('article')!
    await user.click(within(paoloCard).getByRole('button', { name: 'Edit order' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit order' })
    const quantityInput = within(dialog).getByRole('spinbutton', { name: 'Quantity 1' })
    await user.clear(quantityInput)
    await user.type(quantityInput, '3')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm order' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit order' })).not.toBeInTheDocument())
    const updated = await adapter.getOrder(demoOrders[1].id)
    expect(updated!.items).toHaveLength(1)
    expect(updated!.items[0].quantity).toBe(3)
    // Strawberry Hojicha level 2 / Yumeno prices to 22000 centavos in the demo catalog; three units reprice to 66000.
    expect(updated!.items[0].lineTotalCentavos).toBe(66000)
    expect(updated!.subtotalCentavos).toBe(66000)
    expect(updated!.totalCentavos).toBe(66000)
    const orderItems = await adapter.listOrderItems(demoOrders[1].id)
    expect(orderItems).toHaveLength(1)
  })

  it('deletes an order after a single confirmation, leaving no orphan order_items', async () => {
    const adapter = await createAdapter()
    const user = userEvent.setup()
    render(<TodayBoard adapter={adapter} initialDeliveryDate={deliveryDate} />)

    const paoloCard = (await screen.findByRole('heading', { name: 'Paolo Reyes' })).closest('article')!
    await user.click(within(paoloCard).getByRole('button', { name: 'Delete order' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete this order permanently?')
    await user.click(screen.getByRole('button', { name: 'Confirm delete order' }))

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Paolo Reyes' })).not.toBeInTheDocument())
    expect(await adapter.getOrder(demoOrders[1].id)).toBeNull()
    expect(await adapter.listOrderItems(demoOrders[1].id)).toHaveLength(0)
  })
})
