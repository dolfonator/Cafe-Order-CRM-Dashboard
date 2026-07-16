import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ModifierGroup, Setting, StorageAdapter, StorageChange, StorageCollection, StorageUnsubscribe, StoredCustomer, StoredOrder, StoredOrderItem, StoredProduct } from './types'

type Row = Record<string, unknown>

function string(row: Row, key: string): string { return String(row[key]) }
function nullableString(row: Row, key: string): string | null { const value = row[key]; return value == null ? null : String(value) }
function number(row: Row, key: string): number { const value = Number(row[key]); if (!Number.isSafeInteger(value)) throw new TypeError(`${key} must be an integer.`); return value }
function bool(row: Row, key: string): boolean { return Boolean(row[key]) }
function array<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : [] }
function asRow(value: unknown): Row { return value as Row }

function fromProduct(row: Row): StoredProduct { return { id: string(row, 'id'), name: string(row, 'name'), priceCentavos: number(row, 'price_centavos'), active: bool(row, 'active'), createdAt: string(row, 'created_at'), updatedAt: string(row, 'updated_at') } }
function toProduct(product: StoredProduct): Row { return { id: product.id, name: product.name, price_centavos: product.priceCentavos, active: product.active, created_at: product.createdAt, updated_at: product.updatedAt } }
function fromCustomer(row: Row): StoredCustomer { return { id: string(row, 'id'), name: string(row, 'name'), phone: nullableString(row, 'phone'), createdAt: string(row, 'created_at'), updatedAt: string(row, 'updated_at') } }
function toCustomer(customer: StoredCustomer): Row { return { id: customer.id, name: customer.name, phone: customer.phone, created_at: customer.createdAt, updated_at: customer.updatedAt } }
function fromGroup(row: Row): ModifierGroup {
  return { id: string(row, 'id'), name: string(row, 'name'), appliesToProductIds: array<string>(row.applies_to_product_ids), options: array<ModifierGroup['options'][number]>(row.options), allowsMultiple: bool(row, 'allows_multiple'), createdAt: string(row, 'created_at'), updatedAt: string(row, 'updated_at') }
}
function toGroup(group: ModifierGroup): Row { return { id: group.id, name: group.name, applies_to_product_ids: group.appliesToProductIds, options: group.options, allows_multiple: group.allowsMultiple, created_at: group.createdAt, updated_at: group.updatedAt } }
function fromItem(row: Row): StoredOrderItem {
  return { id: string(row, 'id'), orderId: string(row, 'order_id'), productId: string(row, 'product_id'), productName: string(row, 'product_name_snapshot'), quantity: number(row, 'quantity'), modifiers: (row.modifiers ?? {}) as StoredOrderItem['modifiers'], unitPriceCentavos: number(row, 'unit_price_centavos'), lineTotalCentavos: number(row, 'line_total_centavos'), createdAt: string(row, 'created_at'), updatedAt: string(row, 'updated_at') }
}
function toItem(item: StoredOrderItem): Row { return { id: item.id, order_id: item.orderId, product_id: item.productId, product_name_snapshot: item.productName, quantity: item.quantity, modifiers: item.modifiers, unit_price_centavos: item.unitPriceCentavos, line_total_centavos: item.lineTotalCentavos, created_at: item.createdAt, updated_at: item.updatedAt } }
function fromOrder(row: Row, items: StoredOrderItem[] = []): StoredOrder {
  return { id: string(row, 'id'), customerId: string(row, 'customer_id'), status: string(row, 'status') as StoredOrder['status'], items, subtotalCentavos: number(row, 'subtotal_centavos'), deliveryFeeCentavos: number(row, 'delivery_fee_centavos'), totalCentavos: number(row, 'total_centavos'), deliveryDate: nullableString(row, 'delivery_date'), paymentReceived: bool(row, 'payment_received'), rawSource: string(row, 'raw_source'), addressSnapshot: nullableString(row, 'address_snapshot'), notes: nullableString(row, 'notes'), routePosition: row.route_position == null ? null : number(row, 'route_position'), createdAt: string(row, 'created_at'), updatedAt: string(row, 'updated_at') }
}
function toOrder(order: StoredOrder): Row { return { id: order.id, customer_id: order.customerId, status: order.status, subtotal_centavos: order.subtotalCentavos, delivery_fee_centavos: order.deliveryFeeCentavos, total_centavos: order.totalCentavos, delivery_date: order.deliveryDate, payment_received: order.paymentReceived, raw_source: order.rawSource, address_snapshot: order.addressSnapshot, notes: order.notes, route_position: order.routePosition, created_at: order.createdAt, updated_at: order.updatedAt } }
function fromSetting(row: Row): Setting { return { id: string(row, 'id'), key: string(row, 'key'), value: (row.value ?? null) as Setting['value'], createdAt: string(row, 'created_at'), updatedAt: string(row, 'updated_at') } }
function toSetting(setting: Setting): Row { return { id: setting.id, key: setting.key, value: setting.value, created_at: setting.createdAt, updated_at: setting.updatedAt } }

export class SupabaseAdapter implements StorageAdapter {
  private readonly client: SupabaseClient
  private constructor(client: SupabaseClient) { this.client = client }
  static async create(url: string, anonKey: string): Promise<SupabaseAdapter> { return new SupabaseAdapter(createClient(url, anonKey)) }

  private async authenticated(): Promise<void> {
    const { data, error } = await this.client.auth.getUser()
    if (error || !data.user) throw new Error('SupabaseAdapter requires an authenticated user.')
  }
  private async rows(table: string): Promise<Row[]> {
    await this.authenticated()
    const { data, error } = await this.client.from(table).select()
    if (error) throw new Error(`Supabase ${table} read failed: ${error.message}`)
    return (data ?? []) as Row[]
  }
  private async row(table: string, id: string): Promise<Row | null> {
    await this.authenticated()
    const { data, error } = await this.client.from(table).select().eq('id', id).maybeSingle()
    if (error) throw new Error(`Supabase ${table} read failed: ${error.message}`)
    return data ? asRow(data) : null
  }
  private async insert(table: string, value: Row): Promise<Row> {
    await this.authenticated()
    const { data, error } = await this.client.from(table).insert(value).select().single()
    if (error) throw new Error(`Supabase ${table} create failed: ${error.message}`)
    return asRow(data)
  }
  private async replace(table: string, id: string, value: Row): Promise<Row> {
    await this.authenticated()
    const { data, error } = await this.client.from(table).update(value).eq('id', id).select().single()
    if (error) throw new Error(`Supabase ${table} update failed: ${error.message}`)
    return asRow(data)
  }
  private async erase(table: string, id: string): Promise<void> {
    await this.authenticated()
    const { error } = await this.client.from(table).delete().eq('id', id)
    if (error) throw new Error(`Supabase ${table} delete failed: ${error.message}`)
  }

  async listProducts(): Promise<StoredProduct[]> { return (await this.rows('products')).map(fromProduct) }
  async getProduct(id: string): Promise<StoredProduct | null> { const row = await this.row('products', id); return row ? fromProduct(row) : null }
  async createProduct(product: StoredProduct): Promise<StoredProduct> { return fromProduct(await this.insert('products', toProduct(product))) }
  async updateProduct(id: string, patch: Partial<Omit<StoredProduct, 'id' | 'createdAt'>>): Promise<StoredProduct> { const current = await this.getProduct(id); if (!current) throw new Error(`products record ${id} does not exist.`); return fromProduct(await this.replace('products', id, toProduct({ ...current, ...patch }))) }
  deleteProduct = (id: string): Promise<void> => this.erase('products', id)

  async listModifierGroups(): Promise<ModifierGroup[]> { return (await this.rows('modifier_groups')).map(fromGroup) }
  async getModifierGroup(id: string): Promise<ModifierGroup | null> { const row = await this.row('modifier_groups', id); return row ? fromGroup(row) : null }
  async createModifierGroup(group: ModifierGroup): Promise<ModifierGroup> { return fromGroup(await this.insert('modifier_groups', toGroup(group))) }
  async updateModifierGroup(id: string, patch: Partial<Omit<ModifierGroup, 'id' | 'createdAt'>>): Promise<ModifierGroup> { const current = await this.getModifierGroup(id); if (!current) throw new Error(`modifierGroups record ${id} does not exist.`); return fromGroup(await this.replace('modifier_groups', id, toGroup({ ...current, ...patch }))) }
  deleteModifierGroup = (id: string): Promise<void> => this.erase('modifier_groups', id)

  async listCustomers(): Promise<StoredCustomer[]> { return (await this.rows('customers')).map(fromCustomer) }
  async getCustomer(id: string): Promise<StoredCustomer | null> { const row = await this.row('customers', id); return row ? fromCustomer(row) : null }
  async createCustomer(customer: StoredCustomer): Promise<StoredCustomer> { return fromCustomer(await this.insert('customers', toCustomer(customer))) }
  async updateCustomer(id: string, patch: Partial<Omit<StoredCustomer, 'id' | 'createdAt'>>): Promise<StoredCustomer> { const current = await this.getCustomer(id); if (!current) throw new Error(`customers record ${id} does not exist.`); return fromCustomer(await this.replace('customers', id, toCustomer({ ...current, ...patch }))) }
  deleteCustomer = (id: string): Promise<void> => this.erase('customers', id)

  async listOrderItems(orderId?: string): Promise<StoredOrderItem[]> { const items = (await this.rows('order_items')).map(fromItem); return orderId ? items.filter((item) => item.orderId === orderId) : items }
  async getOrderItem(id: string): Promise<StoredOrderItem | null> { const row = await this.row('order_items', id); return row ? fromItem(row) : null }
  async createOrderItem(item: StoredOrderItem): Promise<StoredOrderItem> { return fromItem(await this.insert('order_items', toItem(item))) }
  async updateOrderItem(id: string, patch: Partial<Omit<StoredOrderItem, 'id' | 'createdAt'>>): Promise<StoredOrderItem> { const current = await this.getOrderItem(id); if (!current) throw new Error(`orderItems record ${id} does not exist.`); return fromItem(await this.replace('order_items', id, toItem({ ...current, ...patch }))) }
  deleteOrderItem = (id: string): Promise<void> => this.erase('order_items', id)

  async listOrders(): Promise<StoredOrder[]> {
    const [orders, items] = await Promise.all([this.rows('orders'), this.listOrderItems()])
    return orders.map((order) => fromOrder(order, items.filter((item) => item.orderId === string(order, 'id'))))
  }
  async getOrder(id: string): Promise<StoredOrder | null> { const row = await this.row('orders', id); return row ? fromOrder(row, await this.listOrderItems(id)) : null }
  async createOrder(order: StoredOrder): Promise<StoredOrder> {
    const created = fromOrder(await this.insert('orders', toOrder(order)))
    const items = await Promise.all(order.items.map((item) => this.createOrderItem(item)))
    return { ...created, items }
  }
  async updateOrder(id: string, patch: Partial<Omit<StoredOrder, 'id' | 'createdAt'>>): Promise<StoredOrder> {
    const current = await this.getOrder(id)
    if (!current) throw new Error(`orders record ${id} does not exist.`)
    const next = { ...current, ...patch }
    const updated = fromOrder(await this.replace('orders', id, toOrder(next)))
    if (patch.items) {
      for (const item of current.items) await this.deleteOrderItem(item.id)
      for (const item of patch.items) await this.createOrderItem(item)
    }
    return { ...updated, items: patch.items ?? current.items }
  }
  async deleteOrder(id: string): Promise<void> { await this.erase('orders', id) }

  async listSettings(): Promise<Setting[]> { return (await this.rows('settings')).map(fromSetting) }
  async getSetting(key: string): Promise<Setting | null> { return (await this.listSettings()).find((setting) => setting.key === key) ?? null }
  async setSetting(setting: Setting): Promise<Setting> { const current = await this.getSetting(setting.key); return fromSetting(current ? await this.replace('settings', current.id, toSetting({ ...setting, id: current.id })) : await this.insert('settings', toSetting(setting))) }
  async deleteSetting(key: string): Promise<void> { const setting = await this.getSetting(key); if (setting) await this.erase('settings', setting.id) }

  subscribe(listener: (change: StorageChange) => void): StorageUnsubscribe {
    const tables: Record<string, StorageCollection> = { products: 'products', modifier_groups: 'modifierGroups', customers: 'customers', orders: 'orders', order_items: 'orderItems', settings: 'settings' }
    const channel = this.client.channel('order-dashboard-storage')
    for (const [table, collection] of Object.entries(tables)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        const row = asRow(payload.eventType === 'DELETE' ? payload.old : payload.new)
        const operation = payload.eventType === 'INSERT' ? 'insert' : payload.eventType === 'DELETE' ? 'delete' : 'update'
        const entity = collection === 'products' ? fromProduct(row) : collection === 'modifierGroups' ? fromGroup(row) : collection === 'customers' ? fromCustomer(row) : collection === 'orders' ? fromOrder(row) : collection === 'orderItems' ? fromItem(row) : fromSetting(row)
        listener({ collection, operation, entity } as StorageChange)
      })
    }
    channel.subscribe()
    return () => { void this.client.removeChannel(channel) }
  }
  async close(): Promise<void> { await this.client.removeAllChannels() }
}
