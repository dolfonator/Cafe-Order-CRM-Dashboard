import { useEffect, useState, type ReactNode } from 'react'
import { createStorageAdapter } from './adapter'
import type { StorageAdapter } from './types'
import { StorageAdapterContext } from './useStorageAdapter'

export function StorageProvider({ children }: { children: ReactNode }) {
  const [adapter, setAdapter] = useState<StorageAdapter | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    let created: StorageAdapter | undefined

    void createStorageAdapter()
      .then((storage) => {
        created = storage
        if (!active) {
          void storage.close()
          return
        }
        setAdapter(storage)
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Storage could not be started.')
        setLoading(false)
      })

    return () => {
      active = false
      if (created) void created.close()
    }
  }, [])

  return (
    <StorageAdapterContext.Provider value={{ adapter, loading, error }}>
      {children}
    </StorageAdapterContext.Provider>
  )
}
