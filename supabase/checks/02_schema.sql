-- Read-only production check. SELECT only — safe to run against production.
-- Used in docs/RELEASE_RUNBOOK.md: run after a migration to verify enum labels,
-- required columns/constraints, and lifecycle consistency.

-- 1) Labels of the order_status enum (expected: new, paid, delivered, cancelled)
select
  e.enumlabel as order_status_label
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname = 'order_status'
order by e.enumsortorder;

-- 2) All columns on public.orders (confirm required fields are present)
select
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'orders'
order by c.ordinal_position;

-- 3) All columns on public.order_items (confirm required fields are present)
select
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'order_items'
order by c.ordinal_position;

-- 4) Constraints on public.orders and public.order_items
--    Expect among others: orders_status_payment_consistent, primary keys, foreign keys
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type
from information_schema.table_constraints tc
where tc.table_schema = 'public'
  and tc.table_name in ('orders', 'order_items')
order by tc.table_name, tc.constraint_name;

-- 5) Lifecycle consistency: rows that would violate orders_status_payment_consistent
--    (must return zero rows for a healthy database)
select
  o.id,
  o.status,
  o.payment_received
from public.orders o
where not (
  (o.status = 'new' and not o.payment_received)
  or (o.status in ('paid', 'delivered') and o.payment_received)
  or o.status = 'cancelled'
);

-- Summary: count of violating rows (must be 0)
select
  count(*)::bigint as orders_status_payment_inconsistent_count
from public.orders o
where not (
  (o.status = 'new' and not o.payment_received)
  or (o.status in ('paid', 'delivered') and o.payment_received)
  or o.status = 'cancelled'
);

-- 6) Owner-bound RLS and aggregate RPCs (20260828010000)
--    Combined so the SQL editor's last-result-only display is enough.
select
  public.dashboard_owner_uid() is not null as owner_uid_present,
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('dashboard_owner_uid', 'create_order_with_items', 'replace_order_items', 'delete_customer_cascade')
  ) as owner_rpc_function_count,
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename in ('products', 'modifier_groups', 'customers', 'orders', 'order_items', 'settings')
      and qual = 'true'
  ) as open_authenticated_policies;
