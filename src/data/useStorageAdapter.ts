import { createContext, useContext } from 'react'
import type { StorageAdapter } from './types'

export type StorageAdapterContextValue = {
  adapter: StorageAdapter | null
  loading: boolean
  error: string | null
}

export const StorageAdapterContext = createContext<StorageAdapterContextValue | null>(null)

/** Returns the signed-in shell adapter, or a null-shaped value when used outside StorageProvider. */
export function useStorageAdapter(): StorageAdapterContextValue & { fromProvider: boolean } {
  const value = useContext(StorageAdapterContext)
  if (!value) {
    return { adapter: null, loading: false, error: null, fromProvider: false }
  }
  return { ...value, fromProvider: true }
}
