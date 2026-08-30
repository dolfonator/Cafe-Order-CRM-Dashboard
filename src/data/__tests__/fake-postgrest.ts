/**
 * Fake PostgREST client for SupabaseAdapter tests.
 *
 * Enforces the subset of `supabase/schema.sql` constraints that matter for
 * adapter parity — uuid columns, NOT NULL, enums, CHECKs, FKs, and UNIQUE —
 * so the suite is not blind to Postgres rejections the way LocalAdapter is.
 */

export type Row = Record<string, unknown>
export type PgError = { message: string; code?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VALID_ORDER_STATUSES = new Set(['new', 'paid', 'delivered', 'cancelled'])

/** uuid columns per table (from schema.sql). */
const UUID_COLUMNS: Record<string, string[]> = {
  products: ['id'],
  modifier_groups: ['id'],
  customers: ['id'],
  orders: ['id', 'customer_id'],
  order_items: ['id', 'order_id', 'product_id'],
  settings: ['id'],
}

/** Columns with `default gen_random_uuid()` — may be omitted on insert. */
const UUID_DEFAULTED = new Set([
  'products.id',
  'modifier_groups.id',
  'customers.id',
  'orders.id',
  'order_items.id',
  'settings.id',
])

/** NOT NULL columns (defaults applied before check; nullable columns are omitted). */
const NOT_NULL: Record<string, string[]> = {
  products: ['name', 'price_centavos', 'active'],
  modifier_groups: ['name', 'applies_to_product_ids', 'options', 'allows_multiple'],
  customers: ['name'],
  orders: [
    'customer_id',
    'status',
    'payment_received',
    'subtotal_centavos',
    'delivery_fee_centavos',
    'total_centavos',
    'raw_source',
  ],
  order_items: [
    'order_id',
    'product_id',
    'product_name_snapshot',
    'quantity',
    'modifiers',
    'unit_price_centavos',
    'line_total_centavos',
  ],
  settings: ['key', 'value'],
}

/** Non-uuid defaults applied when a column is omitted on insert. */
const COLUMN_DEFAULTS: Record<string, Record<string, unknown>> = {
  products: { active: true },
  modifier_groups: {
    applies_to_product_ids: [],
    options: [],
    allows_multiple: false,
  },
  orders: { status: 'new', payment_received: false, delivery_fee_centavos: 0 },
  order_items: { modifiers: {} },
}

type ForeignKey = {
  column: string
  refTable: string
  refColumn: string
  constraint: string
  onDelete: 'cascade' | 'no action'
}

const FOREIGN_KEYS: Record<string, ForeignKey[]> = {
  orders: [
    {
      column: 'customer_id',
      refTable: 'customers',
      refColumn: 'id',
      constraint: 'orders_customer_id_fkey',
      onDelete: 'no action',
    },
  ],
  order_items: [
    {
      column: 'order_id',
      refTable: 'orders',
      refColumn: 'id',
      constraint: 'order_items_order_id_fkey',
      onDelete: 'cascade',
    },
    {
      column: 'product_id',
      refTable: 'products',
      refColumn: 'id',
      constraint: 'order_items_product_id_fkey',
      onDelete: 'no action',
    },
  ],
}

export type FakePostgrest = {
  client: FakeClient
  tables: Record<string, Row[]>
  inserts: Row[]
  /** Raw objects passed to PostgREST `.update(...)`, in call order. Reset between tests. */
  updates: Row[]
  /**
   * Deliver a realtime `postgres_changes` payload to every handler registered for `table`,
   * shaped the way supabase-js does it (`new` for INSERT/UPDATE, `old` for DELETE).
   * Awaits each handler so async handlers finish before the assertion runs.
   */
  emit: (table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', row: Row) => Promise<void>
  reset: () => void
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>
  rpcHandlers: Record<string, (args: Record<string, unknown>) => { data: unknown; error: PgError | null }>
}

type RealtimeHandler = (payload: { eventType: string; new: Row; old: Row }) => unknown

type FakeChannel = {
  on: (event: string, filter: { table: string }, handler: RealtimeHandler) => FakeChannel
  subscribe: () => undefined
}

type FakeClient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } }; error: null }> }
  from: (table: string) => TableApi
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: PgError | null }>
  channel: () => FakeChannel
  removeChannel: () => Promise<void>
  removeAllChannels: () => Promise<void>
}

type TableApi = {
  select: () => QueryBuilder
  insert: (value: Row) => QueryBuilder
  update: (value: Row) => QueryBuilder
  delete: () => QueryBuilder
}

type QueryBuilder = {
  select: () => QueryBuilder
  eq: (column: string, value: unknown) => QueryBuilder
  in: (column: string, values: unknown[]) => QueryBuilder
  single: () => Promise<{ data: unknown; error: PgError | null }>
  maybeSingle: () => Promise<{ data: unknown; error: PgError | null }>
  then: (
    resolve: (value: { data: unknown; error: PgError | null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>
}

/** Module-level active instance so vi.mock factories can call createClient without hoisting pain. */
let active: FakePostgrest | null = null

/** Stable entry-point for `vi.mock('@supabase/supabase-js', …)` factories. */
export function fakeCreateClient(): FakeClient {
  if (!active) throw new Error('createFakePostgrest() must run before createClient()')
  return active.client
}

export function createFakePostgrest(): FakePostgrest {
  const tables: Record<string, Row[]> = {}
  const inserts: Row[] = []
  const updates: Row[] = []
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const rpcHandlers: Record<string, (args: Record<string, unknown>) => { data: unknown; error: PgError | null }> = {}
  const realtimeHandlers: Record<string, RealtimeHandler[]> = {}
  let uuidSeq = 1

  function reset(): void {
    for (const key of Object.keys(tables)) delete tables[key]
    for (const key of Object.keys(realtimeHandlers)) delete realtimeHandlers[key]
    for (const key of Object.keys(rpcHandlers)) delete rpcHandlers[key]
    inserts.length = 0
    updates.length = 0
    rpcCalls.length = 0
    uuidSeq = 1
  }

  async function emit(table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', row: Row): Promise<void> {
    const payload =
      eventType === 'DELETE'
        ? { eventType, new: {} as Row, old: row }
        : { eventType, new: row, old: {} as Row }
    for (const handler of realtimeHandlers[table] ?? []) await handler(payload)
  }

  function mintUuid(): string {
    // First minted id stays 90000000-…001 so existing settings tests keep their assertion.
    return `90000000-0000-4000-8000-${String(uuidSeq++).padStart(12, '0')}`
  }

  function nowIso(): string {
    return new Date().toISOString()
  }

  function filterRows(table: string, filters: Array<{ column: string; value: unknown; op?: 'eq' | 'in' }>): Row[] {
    const rows = tables[table] ?? []
    if (filters.length === 0) return [...rows]
    return rows.filter((row) => filters.every((f) => {
      if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(row[f.column])
      return row[f.column] === f.value
    }))
  }

  function validateUuids(table: string, row: Row): PgError | null {
    for (const column of UUID_COLUMNS[table] ?? []) {
      if (!(column in row) || row[column] === undefined) continue
      if (row[column] === null) continue // NOT NULL handles required nulls
      if (!UUID.test(String(row[column]))) {
        return { message: `invalid input syntax for type uuid: "${String(row[column])}"` }
      }
    }
    return null
  }

  function applyInsertDefaults(table: string, value: Row): Row {
    const defaults = COLUMN_DEFAULTS[table] ?? {}
    const row: Row = { ...defaults, ...value }
    const idKey = `${table}.id`
    if (!('id' in value) || value.id === undefined) {
      if (UUID_DEFAULTED.has(idKey)) row.id = mintUuid()
    }
    if (!('created_at' in value) || value.created_at === undefined) row.created_at = nowIso()
    if (!('updated_at' in value) || value.updated_at === undefined) row.updated_at = nowIso()
    if (table === 'orders') applyOrderLifecycleTimestamps(row, null)
    return row
  }

  /**
   * Mirrors `public.set_order_lifecycle_timestamps()` in `supabase/schema.sql`.
   * Mutates `row` in place. `previous` is null on INSERT.
   */
  function applyOrderLifecycleTimestamps(row: Row, previous: Row | null): void {
    const now = nowIso()
    const status = String(row.status ?? (previous?.status ?? 'new'))
    if (previous === null) {
      switch (status) {
        case 'new':
          row.paid_at = null
          row.delivered_at = null
          break
        case 'paid':
          row.paid_at = row.paid_at ?? now
          row.delivered_at = null
          break
        case 'delivered':
          row.paid_at = row.paid_at ?? now
          row.delivered_at = row.delivered_at ?? now
          break
        case 'cancelled':
          // keep NEW.paid_at (may be null); force delivered_at null
          if (!('paid_at' in row)) row.paid_at = null
          row.delivered_at = null
          break
        default:
          break
      }
      return
    }

    const oldStatus = String(previous.status)
    const newStatus = String(row.status ?? oldStatus)
    const enteringPaid = oldStatus !== 'paid' && newStatus === 'paid'
    const enteringDelivered = oldStatus !== 'delivered' && newStatus === 'delivered'
    const enteringCancelled = oldStatus !== 'cancelled' && newStatus === 'cancelled'

    if (enteringPaid) {
      row.paid_at = previous.paid_at ?? now
      row.delivered_at = null
    } else if (enteringDelivered) {
      row.paid_at = previous.paid_at ?? now
      row.delivered_at = previous.delivered_at ?? now
    } else if (enteringCancelled) {
      row.paid_at = previous.paid_at
      row.delivered_at = null
    } else {
      // any other update — preserve old values (client echo discarded)
      row.paid_at = previous.paid_at
      row.delivered_at = previous.delivered_at
    }
  }

  function validateNotNull(table: string, row: Row): PgError | null {
    for (const column of NOT_NULL[table] ?? []) {
      if (!(column in row) || row[column] === undefined || row[column] === null) {
        return { message: `null value in column "${column}" violates not-null constraint` }
      }
    }
    return null
  }

  function validateEnum(table: string, row: Row): PgError | null {
    if (table !== 'orders') return null
    if (!('status' in row) || row.status === undefined || row.status === null) return null
    if (!VALID_ORDER_STATUSES.has(String(row.status))) {
      return { message: `invalid input value for enum order_status: "${String(row.status)}"` }
    }
    return null
  }

  function validateChecks(table: string, row: Row): PgError | null {
    const fail = (constraint: string): PgError => ({
      message: `new row for relation "${table}" violates check constraint "${constraint}"`,
    })

    if (table === 'products' && 'price_centavos' in row && row.price_centavos != null) {
      if (Number(row.price_centavos) < 0) return fail('products_price_centavos_check')
    }

    if (table === 'order_items') {
      if ('quantity' in row && row.quantity != null && Number(row.quantity) <= 0) {
        return fail('order_items_quantity_check')
      }
      if ('unit_price_centavos' in row && row.unit_price_centavos != null && Number(row.unit_price_centavos) < 0) {
        return fail('order_items_unit_price_centavos_check')
      }
      if ('line_total_centavos' in row && row.line_total_centavos != null && Number(row.line_total_centavos) < 0) {
        return fail('order_items_line_total_centavos_check')
      }
    }

    if (table === 'orders') {
      if ('subtotal_centavos' in row && row.subtotal_centavos != null && Number(row.subtotal_centavos) < 0) {
        return fail('orders_subtotal_centavos_check')
      }
      if ('delivery_fee_centavos' in row && row.delivery_fee_centavos != null && Number(row.delivery_fee_centavos) < 0) {
        return fail('orders_delivery_fee_centavos_check')
      }
      if ('total_centavos' in row && row.total_centavos != null && Number(row.total_centavos) < 0) {
        return fail('orders_total_centavos_check')
      }
      if ('status' in row && 'payment_received' in row && row.status != null && row.payment_received != null) {
        const status = String(row.status)
        const paid = Boolean(row.payment_received)
        const ok =
          (status === 'new' && !paid) ||
          ((status === 'paid' || status === 'delivered') && paid) ||
          status === 'cancelled'
        if (!ok) return fail('orders_status_payment_consistent')
      }
      // orders_lifecycle_timestamps_consistent
      if (row.status != null) {
        const status = String(row.status)
        const paidAt = row.paid_at ?? null
        const deliveredAt = row.delivered_at ?? null
        let lifecycleOk = false
        if (status === 'new') {
          lifecycleOk = paidAt == null && deliveredAt == null
        } else if (status === 'paid') {
          lifecycleOk = paidAt != null && deliveredAt == null
        } else if (status === 'delivered') {
          lifecycleOk =
            paidAt != null &&
            deliveredAt != null &&
            String(paidAt) <= String(deliveredAt)
        } else if (status === 'cancelled') {
          lifecycleOk = deliveredAt == null
        } else {
          lifecycleOk = true
        }
        if (!lifecycleOk) return fail('orders_lifecycle_timestamps_consistent')
      }
    }

    return null
  }

  function validateForeignKeys(table: string, row: Row): PgError | null {
    for (const fk of FOREIGN_KEYS[table] ?? []) {
      if (!(fk.column in row) || row[fk.column] === undefined || row[fk.column] === null) continue
      const refId = row[fk.column]
      const parents = tables[fk.refTable] ?? []
      if (!parents.some((parent) => parent[fk.refColumn] === refId)) {
        return {
          message: `insert or update on table "${table}" violates foreign key constraint "${fk.constraint}"`,
        }
      }
    }
    return null
  }

  function validateUnique(table: string, row: Row, excludeId?: unknown): PgError | null {
    // Primary key uniqueness (schema: id uuid primary key on every table).
    if (row.id != null) {
      const dup = (tables[table] ?? []).find(
        (r) => r.id === row.id && (excludeId === undefined || r.id !== excludeId),
      )
      if (dup) {
        return { message: `duplicate key value violates unique constraint "${table}_pkey"` }
      }
    }
    if (table === 'settings' && row.key != null) {
      const existing = (tables.settings ?? []).find(
        (r) => r.key === row.key && (excludeId === undefined || r.id !== excludeId),
      )
      if (existing) {
        return { message: 'duplicate key value violates unique constraint "settings_key_key"' }
      }
    }
    return null
  }

  function validateRow(table: string, row: Row, opts?: { excludeId?: unknown }): PgError | null {
    return (
      validateUuids(table, row) ??
      validateNotNull(table, row) ??
      validateEnum(table, row) ??
      validateChecks(table, row) ??
      validateForeignKeys(table, row) ??
      validateUnique(table, row, opts?.excludeId) ??
      null
    )
  }

  function queryBuilder(
    table: string,
    mode: 'select' | 'insert' | 'update' | 'delete',
    seed?: { data?: unknown; error?: PgError | null; patch?: Row },
  ): QueryBuilder {
    const filters: Array<{ column: string; value: unknown; op?: 'eq' | 'in' }> = []
    const settledError = seed?.error ?? null
    const settledData = seed?.data
    let updateApplied = false
    let updateResult: { data: unknown; error: PgError | null } | null = null
    let deleteApplied = false

    const runUpdate = (): { data: unknown; error: PgError | null } => {
      if (updateApplied && updateResult) return updateResult
      updateApplied = true
      const rows = tables[table] ?? []
      const index = rows.findIndex((row) => filters.every((f) => row[f.column] === f.value))
      if (index < 0) {
        updateResult = {
          data: null,
          error: { message: 'JSON object requested, multiple (or no) rows returned' },
        }
        return updateResult
      }
      const previous = rows[index]
      const merged = { ...previous, ...seed?.patch, updated_at: nowIso() }
      if (table === 'orders') applyOrderLifecycleTimestamps(merged, previous)
      const error = validateRow(table, merged, { excludeId: previous.id })
      if (error) {
        updateResult = { data: null, error }
        return updateResult
      }
      rows[index] = merged
      tables[table] = rows
      updateResult = { data: merged, error: null }
      return updateResult
    }

    const runDelete = (): { data: unknown; error: PgError | null } => {
      if (deleteApplied) return { data: null, error: null }
      deleteApplied = true
      const matched = filterRows(table, filters)
      for (const row of matched) {
        tables[table] = (tables[table] ?? []).filter((r) => r.id !== row.id)
        // ON DELETE CASCADE: order_items.order_id → orders(id)
        if (table === 'orders') {
          tables.order_items = (tables.order_items ?? []).filter((item) => item.order_id !== row.id)
        }
      }
      return { data: null, error: null }
    }

    const execute = (shape: 'many' | 'one' | 'maybe'): { data: unknown; error: PgError | null } => {
      if (settledError) return { data: null, error: settledError }

      if (mode === 'insert') return { data: settledData ?? null, error: null }

      if (mode === 'update') return runUpdate()

      if (mode === 'delete') return runDelete()

      // select
      const rows = filterRows(table, filters)
      if (shape === 'many') return { data: rows, error: null }
      if (rows.length === 0) {
        if (shape === 'maybe') return { data: null, error: null }
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
      }
      if (rows.length > 1 && shape === 'one') {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
      }
      return { data: rows[0], error: null }
    }

    const builder: QueryBuilder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push({ column, value, op: 'eq' })
        return builder
      },
      in: (column: string, values: unknown[]) => {
        filters.push({ column, value: values, op: 'in' })
        return builder
      },
      single: () => Promise.resolve(execute('one')),
      maybeSingle: () => Promise.resolve(execute('maybe')),
      then: (resolve, reject) => {
        // select/delete: resolve to full payload (array / null). insert/update: settled row.
        const shape = mode === 'select' ? 'many' : 'one'
        return Promise.resolve(execute(shape)).then(resolve, reject)
      },
    }
    return builder
  }

  function from(table: string): TableApi {
    return {
      select: () => queryBuilder(table, 'select'),
      insert: (value: Row) => {
        inserts.push(value)
        // Validate client-supplied uuid fields before defaults mask omission.
        const preDefaultUuidError = validateUuids(table, value)
        if (preDefaultUuidError) return queryBuilder(table, 'insert', { error: preDefaultUuidError })

        const row = applyInsertDefaults(table, value)
        const error = validateRow(table, row)
        if (error) return queryBuilder(table, 'insert', { error })

        tables[table] = [...(tables[table] ?? []), row]
        return queryBuilder(table, 'insert', { data: row })
      },
      update: (value: Row) => {
        // Record the exact client payload before merge / trigger emulation.
        updates.push(value)
        return queryBuilder(table, 'update', { patch: value })
      },
      delete: () => queryBuilder(table, 'delete'),
    }
  }

  const client: FakeClient = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from,
    rpc: (name: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ name, args })
      const handler = rpcHandlers[name]
      if (!handler) {
        return Promise.resolve({
          data: null,
          error: { message: `Could not find the function public.${name} in the schema cache`, code: 'PGRST202' },
        })
      }
      return Promise.resolve(handler(args))
    },
    channel: () => {
      const channel: FakeChannel = {
        on: (_event, filter, handler) => {
          const handlers = realtimeHandlers[filter.table] ?? []
          handlers.push(handler)
          realtimeHandlers[filter.table] = handlers
          return channel
        },
        subscribe: () => undefined,
      }
      return channel
    },
    removeChannel: () => Promise.resolve(),
    removeAllChannels: () => Promise.resolve(),
  }

  const instance: FakePostgrest = { client, tables, inserts, updates, emit, reset, rpcCalls, rpcHandlers }
  active = instance
  return instance
}
