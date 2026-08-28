-- Bind RLS to the dashboard owner's auth.uid() and add aggregate RPCs so
-- order create/edit and customer cascade run in one Postgres transaction.
--
-- This migration is applied manually via the Supabase SQL Editor in a
-- maintenance window — never by CI. It does not change order/item/customer
-- row counts or money totals.

begin;

create or replace function public.dashboard_owner_uid()
returns uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select id
  from auth.users
  where email = 'angela@madebyangela.local'
  limit 1
$$;

revoke all on function public.dashboard_owner_uid() from public;
grant execute on function public.dashboard_owner_uid() to authenticated;

do $$
begin
  if public.dashboard_owner_uid() is null then
    raise exception 'dashboard_owner_uid() is null — angela@madebyangela.local is missing from auth.users';
  end if;
end $$;

do $$
declare
  rec record;
begin
  for rec in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('products', 'modifier_groups', 'customers', 'orders', 'order_items', 'settings')
  loop
    execute format('drop policy if exists %I on public.%I', rec.policyname, rec.tablename);
  end loop;
end $$;

create policy "authenticated select products" on public.products for select to authenticated using (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated insert products" on public.products for insert to authenticated with check (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated update products" on public.products for update to authenticated using (auth.uid() = public.dashboard_owner_uid()) with check (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated delete products" on public.products for delete to authenticated using (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated select modifier_groups" on public.modifier_groups for select to authenticated using (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated insert modifier_groups" on public.modifier_groups for insert to authenticated with check (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated update modifier_groups" on public.modifier_groups for update to authenticated using (auth.uid() = public.dashboard_owner_uid()) with check (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated delete modifier_groups" on public.modifier_groups for delete to authenticated using (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated select customers" on public.customers for select to authenticated using (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated insert customers" on public.customers for insert to authenticated with check (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated update customers" on public.customers for update to authenticated using (auth.uid() = public.dashboard_owner_uid()) with check (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated delete customers" on public.customers for delete to authenticated using (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated select orders" on public.orders for select to authenticated using (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated insert orders" on public.orders for insert to authenticated with check (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated update orders" on public.orders for update to authenticated using (auth.uid() = public.dashboard_owner_uid()) with check (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated delete orders" on public.orders for delete to authenticated using (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated select order_items" on public.order_items for select to authenticated using (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated insert order_items" on public.order_items for insert to authenticated with check (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated update order_items" on public.order_items for update to authenticated using (auth.uid() = public.dashboard_owner_uid()) with check (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated delete order_items" on public.order_items for delete to authenticated using (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated select settings" on public.settings for select to authenticated using (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated insert settings" on public.settings for insert to authenticated with check (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated update settings" on public.settings for update to authenticated using (auth.uid() = public.dashboard_owner_uid()) with check (auth.uid() = public.dashboard_owner_uid());
create policy "authenticated delete settings" on public.settings for delete to authenticated using (auth.uid() = public.dashboard_owner_uid());

create or replace function public.create_order_with_items(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted public.orders;
  item jsonb;
begin
  insert into public.orders (
    id, customer_id, status, delivery_date, payment_received,
    subtotal_centavos, delivery_fee_centavos, total_centavos,
    raw_source, address_snapshot, notes, route_position
  ) values (
    (p_order->>'id')::uuid,
    (p_order->>'customer_id')::uuid,
    (p_order->>'status')::public.order_status,
    nullif(p_order->>'delivery_date', '')::date,
    coalesce((p_order->>'payment_received')::boolean, false),
    (p_order->>'subtotal_centavos')::integer,
    (p_order->>'delivery_fee_centavos')::integer,
    (p_order->>'total_centavos')::integer,
    coalesce(p_order->>'raw_source', ''),
    p_order->>'address_snapshot',
    p_order->>'notes',
    nullif(p_order->>'route_position', '')::integer
  )
  returning * into inserted;

  for item in select jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.order_items (
      id, order_id, product_id, product_name_snapshot, quantity, modifiers,
      unit_price_centavos, line_total_centavos
    ) values (
      (item->>'id')::uuid,
      inserted.id,
      (item->>'product_id')::uuid,
      item->>'product_name_snapshot',
      (item->>'quantity')::integer,
      coalesce(item->'modifiers', '{}'::jsonb),
      (item->>'unit_price_centavos')::integer,
      (item->>'line_total_centavos')::integer
    );
  end loop;

  return to_jsonb(inserted);
end;
$$;

create or replace function public.replace_order_items(p_order_id uuid, p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated public.orders;
  item jsonb;
begin
  delete from public.order_items where order_id = p_order_id;

  for item in select jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.order_items (
      id, order_id, product_id, product_name_snapshot, quantity, modifiers,
      unit_price_centavos, line_total_centavos
    ) values (
      (item->>'id')::uuid,
      p_order_id,
      (item->>'product_id')::uuid,
      item->>'product_name_snapshot',
      (item->>'quantity')::integer,
      coalesce(item->'modifiers', '{}'::jsonb),
      (item->>'unit_price_centavos')::integer,
      (item->>'line_total_centavos')::integer
    );
  end loop;

  update public.orders
  set
    subtotal_centavos = coalesce((p_order->>'subtotal_centavos')::integer, subtotal_centavos),
    delivery_fee_centavos = coalesce((p_order->>'delivery_fee_centavos')::integer, delivery_fee_centavos),
    total_centavos = coalesce((p_order->>'total_centavos')::integer, total_centavos),
    delivery_date = case
      when p_order ? 'delivery_date' then nullif(p_order->>'delivery_date', '')::date
      else delivery_date
    end,
    address_snapshot = case
      when p_order ? 'address_snapshot' then p_order->>'address_snapshot'
      else address_snapshot
    end,
    notes = case
      when p_order ? 'notes' then p_order->>'notes'
      else notes
    end
  where id = p_order_id
  returning * into updated;

  if updated.id is null then
    raise exception 'orders record % does not exist.', p_order_id;
  end if;

  return to_jsonb(updated);
end;
$$;

create or replace function public.delete_customer_cascade(p_customer_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.orders where customer_id = p_customer_id;
  delete from public.settings where key = 'customer:' || p_customer_id::text || ':profile';
  delete from public.customers where id = p_customer_id;
end;
$$;

revoke all on function public.create_order_with_items(jsonb, jsonb) from public;
revoke all on function public.replace_order_items(uuid, jsonb, jsonb) from public;
revoke all on function public.delete_customer_cascade(uuid) from public;
grant execute on function public.create_order_with_items(jsonb, jsonb) to authenticated;
grant execute on function public.replace_order_items(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.delete_customer_cascade(uuid) to authenticated;

do $$
begin
  if (
    select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('dashboard_owner_uid', 'create_order_with_items', 'replace_order_items', 'delete_customer_cascade')
  ) <> 4 then
    raise exception 'Expected four public aggregate/owner functions after migration';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('products', 'modifier_groups', 'customers', 'orders', 'order_items', 'settings')
      and qual = 'true'
  ) then
    raise exception 'A public table policy still uses using (true)';
  end if;
end $$;

commit;
