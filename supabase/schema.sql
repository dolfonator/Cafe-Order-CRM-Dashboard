create extension if not exists pgcrypto;

create type public.order_status as enum (
  'new',
  'paid',
  'delivered',
  'cancelled'
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_centavos integer not null check (price_centavos >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  applies_to_product_ids uuid[] not null default '{}',
  options jsonb not null default '[]'::jsonb,
  allows_multiple boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  status public.order_status not null default 'new',
  delivery_date date,
  payment_received boolean not null default false,
  constraint orders_status_payment_consistent check (
    (status = 'new' and not payment_received)
    or (status in ('paid', 'delivered') and payment_received)
    or status = 'cancelled'
  ),
  subtotal_centavos integer not null check (subtotal_centavos >= 0),
  delivery_fee_centavos integer not null default 0 check (delivery_fee_centavos >= 0),
  total_centavos integer not null check (total_centavos >= 0),
  raw_source text not null,
  address_snapshot text,
  notes text,
  route_position integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  modifiers jsonb not null default '{}'::jsonb,
  unit_price_centavos integer not null check (unit_price_centavos >= 0),
  line_total_centavos integer not null check (line_total_centavos >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger modifier_groups_set_updated_at before update on public.modifier_groups for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger order_items_set_updated_at before update on public.order_items for each row execute function public.set_updated_at();
create trigger settings_set_updated_at before update on public.settings for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.modifier_groups enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.settings enable row level security;

create policy "authenticated select products" on public.products for select to authenticated using (true);
create policy "authenticated insert products" on public.products for insert to authenticated with check (true);
create policy "authenticated update products" on public.products for update to authenticated using (true) with check (true);
create policy "authenticated delete products" on public.products for delete to authenticated using (true);
create policy "authenticated select modifier_groups" on public.modifier_groups for select to authenticated using (true);
create policy "authenticated insert modifier_groups" on public.modifier_groups for insert to authenticated with check (true);
create policy "authenticated update modifier_groups" on public.modifier_groups for update to authenticated using (true) with check (true);
create policy "authenticated delete modifier_groups" on public.modifier_groups for delete to authenticated using (true);
create policy "authenticated select customers" on public.customers for select to authenticated using (true);
create policy "authenticated insert customers" on public.customers for insert to authenticated with check (true);
create policy "authenticated update customers" on public.customers for update to authenticated using (true) with check (true);
create policy "authenticated delete customers" on public.customers for delete to authenticated using (true);
create policy "authenticated select orders" on public.orders for select to authenticated using (true);
create policy "authenticated insert orders" on public.orders for insert to authenticated with check (true);
create policy "authenticated update orders" on public.orders for update to authenticated using (true) with check (true);
create policy "authenticated delete orders" on public.orders for delete to authenticated using (true);
create policy "authenticated select order_items" on public.order_items for select to authenticated using (true);
create policy "authenticated insert order_items" on public.order_items for insert to authenticated with check (true);
create policy "authenticated update order_items" on public.order_items for update to authenticated using (true) with check (true);
create policy "authenticated delete order_items" on public.order_items for delete to authenticated using (true);
create policy "authenticated select settings" on public.settings for select to authenticated using (true);
create policy "authenticated insert settings" on public.settings for insert to authenticated with check (true);
create policy "authenticated update settings" on public.settings for update to authenticated using (true) with check (true);
create policy "authenticated delete settings" on public.settings for delete to authenticated using (true);

alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.modifier_groups;
alter publication supabase_realtime add table public.customers;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.settings;
