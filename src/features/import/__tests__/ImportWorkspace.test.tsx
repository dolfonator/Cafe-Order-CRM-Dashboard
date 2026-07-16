import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalAdapter, resetLocalAdapterMemoryForTests } from '../../../data/local-adapter'
import { ImportWorkspace } from '../ImportWorkspace'

afterEach(() => vi.unstubAllGlobals())

describe('ImportWorkspace transport selection', () => {
  it('keeps valid JSON entirely local and sends only free text to the Netlify endpoint', async () => {
    resetLocalAdapterMemoryForTests()
    const adapter = await LocalAdapter.create()
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ orders: [{ customer_name: 'Mika', items: [{ product_slug: 'matcha-latte', quantity: 1 }], address: 'Makati' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<ImportWorkspace adapter={adapter} />)
    const input = screen.getByRole('textbox', { name: 'Order text or JSON' })
    fireEvent.change(input, { target: { value: '{"customer_name":"Mika","items":[{"product_slug":"matcha-latte","quantity":1}],"address":"Makati"}' } })
    await user.click(screen.getByRole('button', { name: 'Create editable drafts' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await screen.findByText('Editable order draft')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '' } })
    await user.type(input, 'Mika: one matcha latte, Makati')
    await user.click(screen.getByRole('button', { name: 'Create editable drafts' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/.netlify/functions/parse-orders', expect.objectContaining({ method: 'POST' })))
    await adapter.close()
  })
})
