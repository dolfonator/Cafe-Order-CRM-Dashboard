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

  it('persists a complete lifecycle, with payment receipt tracked separately', async () => {
    const adapter = await createAdapter()
    await adapter.updateOrder(demoOrders[1].id, { status: 'new', paymentReceived: false })
    const user = userEvent.setup()
    render(<TodayBoard adapter={adapter} initialDeliveryDate={deliveryDate} />)

    const card = await screen.findByRole('heading', { name: 'Paolo Reyes' })
    expect(card).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mark Confirmed' }))
    await waitFor(async () => expect((await adapter.getOrder(demoOrders[1].id))?.status).toBe('confirmed'))

    expect(screen.getByRole('button', { name: 'Confirm payment to advance' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'GCash screenshot received' }))
    await waitFor(async () => expect((await adapter.getOrder(demoOrders[1].id))?.paymentReceived).toBe(true))
    await user.click(await screen.findByRole('button', { name: 'Mark Paid' }))
    await waitFor(async () => expect((await adapter.getOrder(demoOrders[1].id))?.status).toBe('paid'))
    await user.click(await screen.findByRole('button', { name: 'Mark Making' }))
    await waitFor(async () => expect((await adapter.getOrder(demoOrders[1].id))?.status).toBe('making'))
    const paoloCard = (await screen.findByRole('heading', { name: 'Paolo Reyes' })).closest('article')!
    await user.click(within(paoloCard).getByRole('button', { name: 'Mark Out for delivery' }))
    await waitFor(async () => expect((await adapter.getOrder(demoOrders[1].id))?.status).toBe('out_for_delivery'))
    await user.click(within((await screen.findByRole('heading', { name: 'Paolo Reyes' })).closest('article')!).getByRole('button', { name: 'Mark Delivered' }))
    await waitFor(async () => expect((await adapter.getOrder(demoOrders[1].id))?.status).toBe('delivered'))
    expect(within((await screen.findByRole('heading', { name: 'Paolo Reyes' })).closest('article')!).queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('blocks invalid lifecycle transitions and makes cancellation terminal', () => {
    expect(nextStatus('delivered')).toBeNull()
    expect(canAdvance({ ...demoOrders[1], status: 'confirmed', paymentReceived: false })).toBe(false)
    expect(canAdvance({ ...demoOrders[1], status: 'confirmed', paymentReceived: true })).toBe(true)
    for (const status of ['new', 'confirmed', 'paid', 'making', 'out_for_delivery'] as const) expect(canCancel(status)).toBe(true)
    expect(canCancel('delivered')).toBe(false)
    expect(canCancel('cancelled')).toBe(false)
    expect(nextStatus('cancelled')).toBeNull()
  })

  it('cancels a non-delivered order and persists the terminal state', async () => {
    const adapter = await createAdapter()
    const user = userEvent.setup()
    render(<TodayBoard adapter={adapter} initialDeliveryDate={deliveryDate} />)

    const paoloCard = (await screen.findByRole('heading', { name: 'Paolo Reyes' })).closest('article')!
    await user.click(within(paoloCard).getByRole('button', { name: 'Cancel order' }))
    await waitFor(async () => expect((await adapter.getOrder(demoOrders[1].id))?.status).toBe('cancelled'))
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

  it('refreshes when another LocalAdapter session mutates an order', async () => {
    const first = await createAdapter()
    const second = await createAdapter()
    render(<TodayBoard adapter={first} initialDeliveryDate={deliveryDate} />)
    expect(await screen.findByText('Receipt pending')).toBeInTheDocument()

    await second.updateOrder(demoOrders[1].id, { paymentReceived: true })
    await waitFor(() => expect(screen.getByText('Receipt received')).toBeInTheDocument())
  })
})
