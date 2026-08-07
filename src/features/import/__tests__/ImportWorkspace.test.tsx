import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalAdapter, resetLocalAdapterMemoryForTests } from '../../../data/local-adapter'
import { ImportWorkspace } from '../ImportWorkspace'

const getSessionMock = vi.fn()
const getAuthClientMock = vi.fn()

vi.mock('../../auth/supabaseAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/supabaseAuth')>()
  return {
    ...actual,
    getAuthClient: () => getAuthClientMock(),
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  getSessionMock.mockReset()
  getAuthClientMock.mockReset()
})

function withSessionToken(token: string | null) {
  getSessionMock.mockResolvedValue({ data: { session: token ? { access_token: token } : null } })
  getAuthClientMock.mockReturnValue({ auth: { getSession: getSessionMock } })
}

describe('ImportWorkspace transport selection', () => {
  it('keeps valid JSON entirely local and sends only free text to the Netlify endpoint with a bearer token', async () => {
    resetLocalAdapterMemoryForTests()
    const adapter = await LocalAdapter.create()
    const user = userEvent.setup()
    withSessionToken('session-token-abc')
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/.netlify/functions/parse-orders',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer session-token-abc',
        }),
      }),
    ))
    await adapter.close()
  })

  it('fails visibly without calling the extraction endpoint when there is no session', async () => {
    resetLocalAdapterMemoryForTests()
    const adapter = await LocalAdapter.create()
    const user = userEvent.setup()
    withSessionToken(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<ImportWorkspace adapter={adapter} />)
    const input = screen.getByRole('textbox', { name: 'Order text or JSON' })
    fireEvent.change(input, { target: { value: 'Mika: one matcha latte, Makati' } })
    await user.click(screen.getByRole('button', { name: 'Create editable drafts' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/sign in is required/i)
    expect(fetchMock).not.toHaveBeenCalled()
    await adapter.close()
  })

  it('fails visibly without calling extraction when auth is unavailable (demo mode)', async () => {
    resetLocalAdapterMemoryForTests()
    const adapter = await LocalAdapter.create()
    const user = userEvent.setup()
    getAuthClientMock.mockReturnValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<ImportWorkspace adapter={adapter} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Order text or JSON' }), {
      target: { value: 'Mika: one matcha latte, Makati' },
    })
    await user.click(screen.getByRole('button', { name: 'Create editable drafts' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/sign in is required/i)
    expect(fetchMock).not.toHaveBeenCalled()
    await adapter.close()
  })
})
