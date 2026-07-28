begin;

lock table public.orders in access exclusive mode;

create temporary table order_status_migration_baseline on commit drop as
select
  count(*)::bigint as order_count,
  coalesce(sum(subtotal_centavos), 0)::numeric as subtotal_centavos,
  coalesce(sum(delivery_fee_centavos), 0)::numeric as delivery_fee_centavos,
  coalesce(sum(total_centavos), 0)::numeric as total_centavos,
  (select count(*)::bigint from public.order_items) as order_item_count
from public.orders;

create temporary table order_status_migration_timestamps on commit drop as
select id, updated_at
from public.orders;

create type public.order_status_v2 as enum (
  'new',
  'paid',
  'delivered',
  'cancelled'
);

alter table public.orders alter column status drop default;

alter table public.orders
  alter column status type public.order_status_v2
  using (
    case status::text
      when 'new' then 'new'
      when 'confirmed' then case when payment_received then 'paid' else 'new' end
      when 'paid' then 'paid'
      when 'making' then 'paid'
      when 'out_for_delivery' then 'paid'
      when 'delivered' then 'delivered'
      when 'cancelled' then 'cancelled'
      else status::text
    end
  )::public.order_status_v2;

alter table public.orders alter column status set default 'new'::public.order_status_v2;

drop type public.order_status;
alter type public.order_status_v2 rename to order_status;

alter table public.orders disable trigger orders_set_updated_at;

update public.orders
set payment_received = case
  when status = 'new' then false
  when status in ('paid', 'delivered') then true
  else payment_received
end;

alter table public.orders enable trigger orders_set_updated_at;

alter table public.orders
  add constraint orders_status_payment_consistent check (
    (status = 'new' and not payment_received)
    or (status in ('paid', 'delivered') and payment_received)
    or status = 'cancelled'
  );

do $$
declare
  baseline order_status_migration_baseline%rowtype;
begin
  select * into strict baseline from order_status_migration_baseline;

  if (select count(*) from public.orders) <> baseline.order_count then
    raise exception 'Order count changed during status migration';
  end if;
  if (select coalesce(sum(subtotal_centavos), 0) from public.orders) <> baseline.subtotal_centavos then
    raise exception 'Order subtotal changed during status migration';
  end if;
  if (select coalesce(sum(delivery_fee_centavos), 0) from public.orders) <> baseline.delivery_fee_centavos then
    raise exception 'Delivery fee total changed during status migration';
  end if;
  if (select coalesce(sum(total_centavos), 0) from public.orders) <> baseline.total_centavos then
    raise exception 'Order total changed during status migration';
  end if;
  if (select count(*) from public.order_items) <> baseline.order_item_count then
    raise exception 'Order item count changed during status migration';
  end if;
  if exists (
    select 1
    from public.orders orders
    join order_status_migration_timestamps timestamps using (id)
    where orders.updated_at is distinct from timestamps.updated_at
  ) then
    raise exception 'Order timestamp changed during status migration';
  end if;
  if exists (
    select 1
    from public.orders
    where status::text not in ('new', 'paid', 'delivered', 'cancelled')
  ) then
    raise exception 'Legacy order status remains after migration';
  end if;
end;
$$;

commit;
