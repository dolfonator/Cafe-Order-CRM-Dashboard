import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { createInsightsFixture } from '../../../test/fixtures/insights/createInsightsFixture'
import { CustomersFeature } from './CustomersFeature'
import { loadCustomerProfile } from './customer-profile'

describe('CustomersFeature', () => {
  it('searches customers and persists profile details through StorageAdapter', async () => {
    const adapter = await createInsightsFixture()
    const user = userEvent.setup()
    window.history.pushState({}, '', '/customers')
    render(<BrowserRouter><CustomersFeature adapter={adapter} /></BrowserRouter>)

    await screen.findByRole('heading', { name: 'Customers' })
    await user.type(screen.getByRole('searchbox', { name: 'Search customers' }), 'Ana')
    await user.click(screen.getByRole('link', { name: 'View Ana' }))
    await screen.findByRole('heading', { name: 'Ana' })
    await user.clear(screen.getByRole('textbox', { name: 'Notes' }))
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), 'Prefers a quiet drop-off.')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    await screen.findByRole('status')
    await waitFor(async () => expect((await adapter.getSetting('customer:customer-ana:profile'))?.value).toMatchObject({ notes: 'Prefers a quiet drop-off.' }))
    await expect(loadCustomerProfile(adapter, 'customer-ana')).resolves.toMatchObject({ notes: 'Prefers a quiet drop-off.', address: 'Makati City', preferences: '' })
    await adapter.close()
  })
})
