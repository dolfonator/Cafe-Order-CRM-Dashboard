import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalAdapter, resetLocalAdapterMemoryForTests } from '../../data/local-adapter'
import { demoOrders } from '../../demo/seed'
import { OrdersHistory } from './OrdersHistory'

let adapter: LocalAdapter

beforeEach(async () => {
  resetLocalAdapterMemoryForTests()
  adapter = await LocalAdapter.create()
})

afterEach(async () => {
  await adapter.close()
})

describe('OrdersHistory', () => {
  it('searches order history and filters by status and delivery date', async () => {
    await adapter.updateOrder(demoOrders[0].id, { deliveryDate: '2026-07-17' })
    const user = userEvent.setup()
    render(<OrdersHistory adapter={adapter} />)

    expect(await screen.findByRole('heading', { name: 'Mika Santos' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search orders'), 'Paolo')
    expect(await screen.findByRole('heading', { name: 'Paolo Reyes' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mika Santos' })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Search orders'))
    await user.selectOptions(screen.getByLabelText('Status filter'), 'paid')
    expect(await screen.findByRole('heading', { name: 'Mika Santos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Paolo Reyes' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Status filter'), 'all')
    fireEvent.change(screen.getByLabelText('Delivery date filter'), { target: { value: '2026-07-17' } })
    expect(await screen.findByRole('heading', { name: 'Mika Santos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Paolo Reyes' })).not.toBeInTheDocument()
  })
})
