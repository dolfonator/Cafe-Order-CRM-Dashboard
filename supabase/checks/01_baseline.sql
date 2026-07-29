-- Read-only production check. SELECT only — safe to run against production.
-- Used in docs/RELEASE_RUNBOOK.md: record baseline before a migration, then
-- re-run after applying the migration and compare invariants.

select
  count(*)::bigint as order_count,
  (select count(*)::bigint from public.order_items) as order_item_count,
  coalesce(sum(subtotal_centavos), 0)::numeric as subtotal_centavos,
  coalesce(sum(delivery_fee_centavos), 0)::numeric as delivery_fee_centavos,
  coalesce(sum(total_centavos), 0)::numeric as total_centavos,
  (
    select coalesce(json_object_agg(status::text, status_count), '{}'::json)
    from (
      select status, count(*)::bigint as status_count
      from public.orders
      group by status
    ) status_counts
  ) as counts_by_status
from public.orders;
