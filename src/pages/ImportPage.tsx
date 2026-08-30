import { useStorageAdapter } from '../data/StorageProvider'
import { ImportWorkspace } from '../features/import/ImportWorkspace'

export function ImportPage() {
  const { adapter, error } = useStorageAdapter()

  if (error) return <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>
  if (!adapter) return <p className="text-sm text-[#4A5365]">Preparing local order storage…</p>
  return <ImportWorkspace adapter={adapter} />
}
