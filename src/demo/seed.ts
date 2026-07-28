import type { ModifierGroup, Setting, StoredCustomer, StoredOrder, StoredOrderItem, StoredProduct } from '../data/types'

const at = '2026-07-16T08:00:00.000Z'

export const demoProducts: StoredProduct[] = [
  { id: '10000000-0000-4000-8000-000000000001', name: 'Matcha Latte', priceCentavos: 20000, active: true, createdAt: at, updatedAt: at },
  { id: '10000000-0000-4000-8000-000000000002', name: 'Strawberry Matcha', priceCentavos: 22000, active: true, createdAt: at, updatedAt: at },
  { id: '10000000-0000-4000-8000-000000000003', name: 'Salted Maple Matcha', priceCentavos: 22000, active: true, createdAt: at, updatedAt: at },
  { id: '10000000-0000-4000-8000-000000000004', name: 'Hojicha Latte', priceCentavos: 18000, active: true, createdAt: at, updatedAt: at },
  { id: '10000000-0000-4000-8000-000000000005', name: 'Strawberry Hojicha', priceCentavos: 20000, active: true, createdAt: at, updatedAt: at },
  { id: '10000000-0000-4000-8000-000000000006', name: 'Salted Maple Hojicha', priceCentavos: 20000, active: true, createdAt: at, updatedAt: at },
]

const matchaIds = demoProducts.slice(0, 3).map((product) => product.id)
const hojichaIds = demoProducts.slice(3).map((product) => product.id)

export const demoModifierGroups: ModifierGroup[] = [
  { id: '20000000-0000-4000-8000-000000000001', name: 'Matcha level', appliesToProductIds: matchaIds, options: [{ id: 'l1', label: 'L1 · 5g', priceCentavos: 0, default: true }, { id: 'l2', label: 'L2', priceCentavos: 2500 }, { id: 'l3', label: 'L3', priceCentavos: 5000 }], allowsMultiple: false, createdAt: at, updatedAt: at },
  { id: '20000000-0000-4000-8000-000000000002', name: 'Hojicha level', appliesToProductIds: hojichaIds, options: [{ id: 'l1', label: 'L1 · 6g', priceCentavos: 0, default: true }, { id: 'l2', label: 'L2', priceCentavos: 2000 }, { id: 'l3', label: 'L3', priceCentavos: 4000 }], allowsMultiple: false, createdAt: at, updatedAt: at },
  { id: '20000000-0000-4000-8000-000000000003', name: 'Powder', appliesToProductIds: demoProducts.map((product) => product.id), options: [{ id: 'yumeno', label: 'Yumeno', priceCentavos: 0, default: true }, { id: 'mk-isuzu', label: 'MK Isuzu', priceCentavos: 6000 }], allowsMultiple: false, createdAt: at, updatedAt: at },
  { id: '20000000-0000-4000-8000-000000000004', name: 'Sweetness', appliesToProductIds: [demoProducts[0].id, demoProducts[3].id], options: [{ id: 'none', label: 'None', priceCentavos: 0 }, { id: 'light', label: 'Light', priceCentavos: 0 }, { id: 'regular', label: 'Regular', priceCentavos: 0, default: true }, { id: 'extra', label: 'Extra', priceCentavos: 0 }], allowsMultiple: false, createdAt: at, updatedAt: at },
  { id: '20000000-0000-4000-8000-000000000005', name: 'Thermal bag', appliesToProductIds: demoProducts.map((product) => product.id), options: [{ id: 'one-cup', label: '1 cup', priceCentavos: 2500 }, { id: 'two-cups', label: '2 cups', priceCentavos: 3000 }, { id: 'three-four-cups', label: '3–4 cups', priceCentavos: 3500 }], allowsMultiple: false, createdAt: at, updatedAt: at },
  { id: '20000000-0000-4000-8000-000000000006', name: 'Milk', appliesToProductIds: demoProducts.map((product) => product.id), options: [{ id: 'oat-milk', label: 'Oat milk', priceCentavos: 0, default: true }], allowsMultiple: false, createdAt: at, updatedAt: at },
]

export const demoCustomers: StoredCustomer[] = [
  { id: '30000000-0000-4000-8000-000000000001', name: 'Mika Santos', phone: '09171234567', createdAt: at, updatedAt: at },
  { id: '30000000-0000-4000-8000-000000000002', name: 'Paolo Reyes', phone: '09179876543', createdAt: at, updatedAt: at },
  { id: '30000000-0000-4000-8000-000000000003', name: 'Aira Cruz', phone: null, createdAt: at, updatedAt: at },
]

export const demoOrderItems: StoredOrderItem[] = [
  { id: '50000000-0000-4000-8000-000000000001', orderId: '40000000-0000-4000-8000-000000000001', productId: demoProducts[0].id, productName: 'Matcha Latte', quantity: 2, modifiers: { level: 1, powder: 'yumeno', sweetness: 'regular' }, unitPriceCentavos: 20000, lineTotalCentavos: 40000, createdAt: at, updatedAt: at },
  { id: '50000000-0000-4000-8000-000000000002', orderId: '40000000-0000-4000-8000-000000000002', productId: demoProducts[4].id, productName: 'Strawberry Hojicha', quantity: 1, modifiers: { level: 2, powder: 'yumeno' }, unitPriceCentavos: 22000, lineTotalCentavos: 22000, createdAt: at, updatedAt: at },
]

export const demoOrders: StoredOrder[] = [
  { id: '40000000-0000-4000-8000-000000000001', customerId: demoCustomers[0].id, status: 'paid', items: [demoOrderItems[0]], subtotalCentavos: 40000, deliveryFeeCentavos: 3500, totalCentavos: 43500, deliveryDate: '2026-07-16', paymentReceived: true, rawSource: 'demo', addressSnapshot: 'Makati City', notes: 'Ring the lobby intercom.', routePosition: 1, createdAt: at, updatedAt: at },
  { id: '40000000-0000-4000-8000-000000000002', customerId: demoCustomers[1].id, status: 'new', items: [demoOrderItems[1]], subtotalCentavos: 22000, deliveryFeeCentavos: 2500, totalCentavos: 24500, deliveryDate: '2026-07-16', paymentReceived: false, rawSource: 'demo', addressSnapshot: 'Quezon City', notes: null, routePosition: 2, createdAt: at, updatedAt: at },
]

export const demoSettings: Setting[] = [{ id: '60000000-0000-4000-8000-000000000001', key: 'business', value: { name: 'Made by Angela', currency: 'PHP', timezone: 'Asia/Manila' }, createdAt: at, updatedAt: at }]
