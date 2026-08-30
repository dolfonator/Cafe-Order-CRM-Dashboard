import { render, screen, waitFor } from '@testing-library/react'
import { StorageProvider } from '../StorageProvider'
import { useStorageAdapter } from '../useStorageAdapter'
import type { StorageAdapter } from '../types'

function Probe({ label }: { label: string }) {
  const { adapter } = useStorageAdapter()
  return <p data-testid={label}>{adapter ? 'ready' : 'waiting'}</p>
}

function Capture({ bucket }: { bucket: StorageAdapter[] }) {
  const { adapter } = useStorageAdapter()
  if (adapter && !bucket.includes(adapter)) bucket.push(adapter)
  return null
}

describe('StorageProvider', () => {
  it('exposes one adapter instance to consumers', async () => {
    const seen: StorageAdapter[] = []
    render(
      <StorageProvider>
        <Probe label="a" />
        <Probe label="b" />
        <Capture bucket={seen} />
        <Capture bucket={seen} />
      </StorageProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('a')).toHaveTextContent('ready')
      expect(screen.getByTestId('b')).toHaveTextContent('ready')
    })
    expect(seen).toHaveLength(1)
  })

  it('does not create an adapter outside the provider', () => {
    function Outside() {
      const { adapter, fromProvider } = useStorageAdapter()
      return (
        <p>
          {fromProvider ? 'inside' : 'outside'}:{adapter ? 'adapter' : 'none'}
        </p>
      )
    }
    render(<Outside />)
    expect(screen.getByText('outside:none')).toBeInTheDocument()
  })
})
