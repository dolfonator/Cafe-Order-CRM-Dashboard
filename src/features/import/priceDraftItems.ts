import { getRuntimeCatalog } from '../../domain/catalog'
import { priceOrder } from '../../domain/pricing'
import type { PricedOrder, ProductSlug } from '../../domain/contracts'
import type { StoredOrderItem, StoredProduct } from '../../data/types'
import { withCupNames } from './cup-names'
import type { ImportItem, ImportThermalBag } from './types'

export type PriceDraftItemsInput = {
  items: readonly ImportItem[]
  thermalBags: readonly ImportThermalBag[]
  productByName: Map<string, StoredProduct>
  orderId: string
  timestamp: string
  customerName?: string | null
}

export type PriceDraftItemsResult = {
  priced: PricedOrder
  items: StoredOrderItem[]
}

export function priceDraftItems(input: PriceDraftItemsInput): PriceDraftItemsResult {
  const priced = priceOrder({
    ...(input.customerName ? { customer: { name: input.customerName } } : {}),
    items: input.items.map((item) => ({
      productSlug: item.productSlug! as ProductSlug,
      quantity: item.quantity!,
      modifiers: {
        level: item.level!,
        powder: item.powder!,
        ...(item.sweetness ? { sweetness: item.sweetness } : {}),
      },
    })),
    thermalBags: input.thermalBags.map((bag) => ({ coveredCupCount: bag.coveredCupCount! })),
  })

  const items: StoredOrderItem[] = priced.items.map((item, index) => {
    const product: StoredProduct | undefined = input.productByName.get(getRuntimeCatalog()[item.productSlug].name)
    if (!product) throw new Error(`Storage is missing the catalog product ${item.productName}`)
    return {
      id: crypto.randomUUID(),
      orderId: input.orderId,
      productId: product.id,
      productName: item.productName,
      quantity: item.quantity,
      modifiers: withCupNames(item.modifiers, input.items[index]?.cupNames),
      unitPriceCentavos: item.unitPriceCentavos,
      lineTotalCentavos: item.lineTotalCentavos,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
    }
  })

  return { priced, items }
}
