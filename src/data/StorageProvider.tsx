import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createStorageAdapter } from './adapter'
import type { StorageAdapter } from './types'

export type StorageAdapterContextValue = {
  adapter: StorageAdapter | null
  loading: boolean
  error: string | null
}

const StorageAdapterContext = createContext<StorageAdapterContextValue | null>(null)

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

/** Returns the signed-in shell adapter, or a null-shaped value when used outside StorageProvider. */
export function useStorageAdapter(): StorageAdapterContextValue & { fromProvider: boolean } {
  const value = useContext(StorageAdapterContext)
  if (!value) {
    return { adapter: null, loading: false, error: null, fromProvider: false }
  }
  return { ...value, fromProvider: true }
}
