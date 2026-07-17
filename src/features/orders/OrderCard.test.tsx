import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { demoCustomers, demoOrders } from '../../demo/seed'
import { OrderCard } from './OrderCard'

const noop = async () => {}

describe('OrderCard edit and delete controls', () => {
  it('omits Edit order and Delete order buttons when the callbacks are not provided (back-compat with existing callers)', () => {
    render(<OrderCard order={demoOrders[0]} customer={demoCustomers[0]} onAdvance={noop} onCancel={noop} onPaymentReceived={noop} />)
    expect(screen.queryByRole('button', { name: 'Edit order' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete order' })).not.toBeInTheDocument()
  })

  it('calls onEdit with the order when Edit order is clicked', async () => {
    const onEdit = vi.fn()
    const user = userEvent.setup()
    render(<OrderCard order={demoOrders[0]} customer={demoCustomers[0]} onAdvance={noop} onCancel={noop} onPaymentReceived={noop} onEdit={onEdit} />)
    await user.click(screen.getByRole('button', { name: 'Edit order' }))
    expect(onEdit).toHaveBeenCalledWith(demoOrders[0])
  })

  it('requires a single confirmation before calling onDelete, and can be backed out of', async () => {
    const onDelete = vi.fn(async () => {})
    const user = userEvent.setup()
    render(<OrderCard order={demoOrders[0]} customer={demoCustomers[0]} onAdvance={noop} onCancel={noop} onPaymentReceived={noop} onDelete={onDelete} />)

    await user.click(screen.getByRole('button', { name: 'Delete order' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Delete this order permanently?')

    await user.click(screen.getByRole('button', { name: 'Keep order' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete order' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete order' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete order' }))
    expect(onDelete).toHaveBeenCalledWith(demoOrders[0])
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
