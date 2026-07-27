import { getRuntimeCatalog, PRODUCT_CATALOG } from '../domain/catalog'
import type { StorageAdapter, StoredProduct } from './types'

/**
 * Guarantees the `products` registry contains a row for every catalog drink and
 * returns them keyed by name.
 *
 * Why this exists: `LocalAdapter.create()` seeds the six catalog products via
 * `seedIfEmpty()`, but `SupabaseAdapter` seeds nothing and `supabase/schema.sql`
 * only creates an EMPTY products table. A Supabase deployment therefore had no
 * product rows unless someone inserted them by hand, and the first order to be
 * confirmed failed with "Storage is missing the catalog product <name>". Because
 * every test runs against LocalAdapter, the whole suite was blind to it.
 *
 * `products` is an administrative registry that exists to give `order_items` a
 * foreign key — it is NEVER a pricing source (the closed catalog in
 * `domain/catalog.ts` is the sole price authority), so back-filling a missing
 * row cannot affect what a customer is charged.
 */
export async function ensureCatalogProducts(adapter: StorageAdapter): Promise<Map<string, StoredProduct>> {
  const existing = await adapter.listProducts()
  const byName = new Map(existing.map((product) => [product.name, product]))

  // Back-fill from the closed catalog, not the runtime one: a drink the owner has
  // switched off in Settings is absent from `getRuntimeCatalog()`, and skipping it
  // here would leave old orders that reference it unsaveable on edit.
  for (const product of Object.values(PRODUCT_CATALOG)) {
    if (byName.has(product.name)) continue
    const timestamp = new Date().toISOString()
    const basePriceCentavos = getRuntimeCatalog()[product.slug]?.basePriceCentavos ?? product.basePriceCentavos
    byName.set(product.name, await adapter.createProduct({
      id: crypto.randomUUID(),
      name: product.name,
      priceCentavos: basePriceCentavos,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
  }

  return byName
}
