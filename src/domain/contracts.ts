export type EntityId = string
export type MoneyCentavos = number

export type OrderStatus = 'new' | 'confirmed' | 'paid' | 'making' | 'out_for_delivery' | 'delivered' | 'cancelled'

export type Customer = { id: EntityId; name: string; phone: string | null; createdAt: string }
export type Product = { id: EntityId; name: string; priceCentavos: MoneyCentavos; active: boolean }
export type OrderItem = { id: EntityId; productId: EntityId; productName: string; quantity: number; unitPriceCentavos: MoneyCentavos }
export type Order = {
  id: EntityId
  customerId: EntityId
  status: OrderStatus
  items: OrderItem[]
  subtotalCentavos: MoneyCentavos
  deliveryFeeCentavos: MoneyCentavos
  totalCentavos: MoneyCentavos
  createdAt: string
  updatedAt: string
}
