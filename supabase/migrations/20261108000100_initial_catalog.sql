create schema if not exists private;
revoke all on schema private from public;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  role text not null check (role in ('owner', 'staff'))
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  name text not null check (btrim(name) <> ''),
  brand text not null default '',
  variant text not null default '',
  unit text not null check (btrim(unit) <> ''),
  sku text check (sku is null or btrim(sku) <> ''),
  aliases text[] not null default '{}',
  sale_price numeric(12,2) not null check (sale_price >= 0 and sale_price <> 'NaN'),
  stock_qty numeric(12,2) check (stock_qty >= 0 and stock_qty <> 'NaN'),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (store_id, id)
);

-- PostgREST can expose public products safely, including when a staff client asks for *.
create table public.product_costs (
  product_id uuid primary key,
  store_id uuid not null,
  cost_price numeric(12,2) not null check (cost_price >= 0 and cost_price <> 'NaN'),
  foreign key (store_id, product_id) references public.products(store_id, id)
);

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  old_price numeric(12,2) not null check (old_price >= 0 and old_price <> 'NaN'),
  new_price numeric(12,2) not null check (new_price >= 0 and new_price <> 'NaN'),
  changed_by uuid not null,
  changed_at timestamptz not null default now(),
  foreign key (store_id, product_id) references public.products(store_id, id)
);

create index products_store_active_idx on public.products (store_id, is_active);
create unique index products_store_sku_idx on public.products (store_id, lower(btrim(sku))) where sku is not null;
create index price_history_store_time_idx on public.price_history (store_id, changed_at desc);
create index price_history_product_time_idx on public.price_history (product_id, changed_at desc);

alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.price_history enable row level security;

revoke all on public.stores, public.profiles, public.products, public.product_costs, public.price_history
  from public, anon, authenticated;
grant select on public.stores, public.profiles, public.products, public.product_costs, public.price_history to authenticated;
grant insert (store_id, name, brand, variant, unit, sku, aliases, sale_price, stock_qty, is_active)
  on public.products to authenticated;
grant update (name, brand, variant, unit, sku, aliases, sale_price, stock_qty, is_active)
  on public.products to authenticated;
grant insert (store_id, product_id, cost_price), update (cost_price), delete on public.product_costs to authenticated;

create policy own_profile on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy own_store on public.stores for select to authenticated
  using (id = (select store_id from public.profiles where user_id = (select auth.uid())));

create policy read_catalog on public.products for select to authenticated
  using (
    store_id = (select store_id from public.profiles where user_id = (select auth.uid()))
    and (is_active or (select role from public.profiles where user_id = (select auth.uid())) = 'owner')
  );

create policy owner_insert_product on public.products for insert to authenticated
  with check (store_id = (select store_id from public.profiles where user_id = (select auth.uid()) and role = 'owner'));

create policy owner_update_product on public.products for update to authenticated
  using (store_id = (select store_id from public.profiles where user_id = (select auth.uid()) and role = 'owner'))
  with check (store_id = (select store_id from public.profiles where user_id = (select auth.uid()) and role = 'owner'));

create policy owner_costs on public.product_costs for all to authenticated
  using (store_id = (select store_id from public.profiles where user_id = (select auth.uid()) and role = 'owner'))
  with check (store_id = (select store_id from public.profiles where user_id = (select auth.uid()) and role = 'owner'));

create policy owner_history on public.price_history for select to authenticated
  using (store_id = (select store_id from public.profiles where user_id = (select auth.uid()) and role = 'owner'));

create function private.touch_product() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create function private.record_price_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Perubahan harga memerlukan pengguna terautentikasi.' using errcode = '42501';
  end if;

  insert into public.price_history (store_id, product_id, old_price, new_price, changed_by, changed_at)
  values (new.store_id, new.id, old.sale_price, new.sale_price, auth.uid(), pg_catalog.clock_timestamp());
  return new;
end;
$$;

revoke execute on function private.touch_product(), private.record_price_change() from public, anon, authenticated;

create trigger products_touch before update on public.products
  for each row execute function private.touch_product();

create trigger products_price_change after update on public.products
  for each row when (old.sale_price is distinct from new.sale_price)
  execute function private.record_price_change();

-- One transaction for catalog, optional cost, and the audit entry.
create function public.save_product(
  p_id uuid, p_store_id uuid, p_name text, p_brand text, p_variant text, p_unit text,
  p_sku text, p_aliases text[], p_sale_price numeric, p_stock_qty numeric, p_is_active boolean,
  p_cost_price numeric, p_expected_sale_price numeric
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and store_id = p_store_id and role = 'owner'
  ) then
    raise exception 'Hanya pemilik toko yang dapat menyimpan produk.' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.products (store_id, name, brand, variant, unit, sku, aliases, sale_price, stock_qty, is_active)
    values (p_store_id, p_name, p_brand, p_variant, p_unit, p_sku, p_aliases, p_sale_price, p_stock_qty, p_is_active)
    returning id into saved_id;
  else
    update public.products
    set name = p_name, brand = p_brand, variant = p_variant, unit = p_unit, sku = p_sku,
      aliases = p_aliases, sale_price = p_sale_price, stock_qty = p_stock_qty, is_active = p_is_active
    where id = p_id and store_id = p_store_id and sale_price = p_expected_sale_price
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Produk atau harga telah berubah. Muat ulang data sebelum menyimpan.' using errcode = '40001';
    end if;
  end if;

  if p_cost_price is null then
    delete from public.product_costs where product_id = saved_id and store_id = p_store_id;
  else
    insert into public.product_costs (product_id, store_id, cost_price)
    values (saved_id, p_store_id, p_cost_price)
    on conflict (product_id) do update set cost_price = excluded.cost_price;
  end if;

  return saved_id;
end;
$$;

revoke execute on function public.save_product(uuid, uuid, text, text, text, text, text, text[], numeric, numeric, boolean, numeric, numeric)
  from public, anon;
grant execute on function public.save_product(uuid, uuid, text, text, text, text, text, text[], numeric, numeric, boolean, numeric, numeric)
  to authenticated;
