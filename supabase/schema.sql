-- Cherokee Auto Parts: schema inicial para Supabase (PostgreSQL)
-- Ejecutar en SQL Editor del proyecto. No contiene claves ni usuarios.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text not null default '',
  rol text not null default 'trabajador' check (rol in ('admin', 'trabajador')),
  activo boolean not null default true,
  must_change_password boolean not null default false,
  fecha_creacion timestamptz not null default now()
);

alter table public.profiles add column if not exists activo boolean not null default true;
alter table public.profiles add column if not exists must_change_password boolean not null default false;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  marca text not null default '',
  categoria text not null default '',
  descripcion text not null default '',
  precio numeric(12,2) not null check (precio >= 0),
  stock integer not null default 0 check (stock >= 0),
  imagen_url text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  nombre_cliente text not null,
  telefono_cliente text not null,
  total numeric(12,2) not null default 0 check (total >= 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'preparando', 'completado', 'cancelado')),
  fecha_creacion timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  nombre_producto text not null,
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  cantidad integer not null check (cantidad > 0),
  subtotal numeric(12,2) not null check (subtotal >= 0)
);

create index if not exists products_estado_categoria_idx on public.products (estado, categoria);
create index if not exists products_nombre_idx on public.products using gin (to_tsvector('simple', nombre));
create index if not exists orders_fecha_creacion_idx on public.orders (fecha_creacion desc);
create index if not exists orders_estado_idx on public.orders (estado);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);

create or replace function public.touch_product_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.fecha_actualizacion = now();
  return new;
end;
$$;
drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute procedure public.touch_product_updated_at();

-- Perfil creado automáticamente al crear un usuario en Supabase Auth.
-- Los usuarios nuevos reciben rol trabajador; el primer admin se promueve
-- manualmente en SQL Editor según las instrucciones del README.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre, email, rol, must_change_password)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    'trabajador',
    coalesce(new.raw_app_meta_data ->> 'must_change_password', 'false') = 'true'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Funciones pequeñas y no expuestas a clientes anónimos para evitar
-- políticas RLS recursivas sobre profiles.
create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol from public.profiles p
  where p.id = (select auth.uid())
    and p.activo
    and (p.rol = 'admin' or not p.must_change_password)
$$;

revoke all on function public.current_staff_role() from public, anon;
grant execute on function public.current_staff_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Perfil: cada integrante consulta el suyo; el administrador consulta todos.
drop policy if exists "profiles_read_self_or_admin" on public.profiles;
create policy "profiles_read_self_or_admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.current_staff_role()) = 'admin');

-- No se concede INSERT/UPDATE/DELETE de profiles a roles de aplicación.
-- De este modo no pueden autoasignarse admin ni cambiar permisos desde el cliente.

drop policy if exists "products_public_read_active" on public.products;
create policy "products_public_read_active" on public.products
  for select to anon, authenticated using (estado = 'activo');
drop policy if exists "products_staff_read_all" on public.products;
create policy "products_staff_read_all" on public.products
  for select to authenticated
  using ((select public.current_staff_role()) in ('admin', 'trabajador'));
drop policy if exists "products_staff_insert" on public.products;
create policy "products_staff_insert" on public.products
  for insert to authenticated
  with check ((select public.current_staff_role()) in ('admin', 'trabajador'));
drop policy if exists "products_staff_update" on public.products;
create policy "products_staff_update" on public.products
  for update to authenticated
  using ((select public.current_staff_role()) in ('admin', 'trabajador'))
  with check ((select public.current_staff_role()) in ('admin', 'trabajador'));

-- El trabajador puede editar datos del producto, pero no activarlo/desactivarlo.
create or replace function public.guard_product_state_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select public.current_staff_role()) = 'trabajador' and new.estado is distinct from old.estado then
    raise exception 'Solo un administrador puede cambiar el estado del producto';
  end if;
  return new;
end;
$$;
drop trigger if exists products_guard_state_change on public.products;
create trigger products_guard_state_change
  before update on public.products
  for each row execute procedure public.guard_product_state_change();
drop policy if exists "products_admin_delete" on public.products;
create policy "products_admin_delete" on public.products
  for delete to authenticated
  using ((select public.current_staff_role()) = 'admin');

-- Solo personal autenticado puede consultar pedidos y sus líneas.
drop policy if exists "orders_staff_read" on public.orders;
create policy "orders_staff_read" on public.orders
  for select to authenticated
  using ((select public.current_staff_role()) in ('admin', 'trabajador'));
drop policy if exists "orders_admin_update_status" on public.orders;
create policy "orders_admin_update_status" on public.orders
  for update to authenticated
  using ((select public.current_staff_role()) = 'admin')
  with check ((select public.current_staff_role()) = 'admin');
drop policy if exists "order_items_staff_read" on public.order_items;
create policy "order_items_staff_read" on public.order_items
  for select to authenticated
  using ((select public.current_staff_role()) in ('admin', 'trabajador'));

-- No hay políticas públicas de escritura para orders/order_items.
-- El checkout anónimo usa esta función: el servidor vuelve a leer precios,
-- valida stock, bloquea las filas y descuenta existencias atómicamente.
drop function if exists public.place_order(text, text, jsonb);
create function public.place_order(
  p_nombre_cliente text,
  p_telefono_cliente text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_total numeric(12,2) := 0;
  v_lines integer := 0;
  v_summary_items jsonb := '[]'::jsonb;
begin
  if length(trim(coalesce(p_nombre_cliente, ''))) not between 2 and 120 then
    raise exception 'Nombre de cliente inválido';
  end if;
  if length(trim(coalesce(p_telefono_cliente, ''))) not between 5 and 40 then
    raise exception 'Teléfono de cliente inválido';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'El pedido debe incluir entre 1 y 50 líneas';
  end if;

  insert into public.orders (nombre_cliente, telefono_cliente, total)
  values (trim(p_nombre_cliente), trim(p_telefono_cliente), 0)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_lines := v_lines + 1;
    if coalesce(v_item ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_item ->> 'quantity', '') !~ '^[0-9]+$' then
      raise exception 'Línea de pedido inválida';
    end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 100 then
      raise exception 'Cantidad inválida';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
    for update;

    if not found or v_product.estado <> 'activo' then
      raise exception 'Producto no disponible';
    end if;
    if v_product.stock < v_quantity then
      raise exception 'Existencias insuficientes para: %', v_product.nombre;
    end if;

    insert into public.order_items (order_id, product_id, nombre_producto, precio_unitario, cantidad, subtotal)
    values (v_order_id, v_product.id, v_product.nombre, v_product.precio, v_quantity, v_product.precio * v_quantity);
    update public.products set stock = stock - v_quantity, fecha_actualizacion = now() where id = v_product.id;
    v_total := v_total + v_product.precio * v_quantity;
    v_summary_items := v_summary_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'nombre', v_product.nombre,
      'precio_unitario', v_product.precio,
      'cantidad', v_quantity,
      'subtotal', v_product.precio * v_quantity
    ));
  end loop;

  update public.orders set total = v_total where id = v_order_id;
  return jsonb_build_object('order_id', v_order_id, 'total', v_total, 'items', v_summary_items);
end;
$$;

revoke all on function public.place_order(text, text, jsonb) from public, authenticated;
grant execute on function public.place_order(text, text, jsonb) to anon;

-- Bucket público para servir imágenes de productos. Escritura solo para personal.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'product-images');
drop policy if exists "product_images_staff_upload" on storage.objects;
create policy "product_images_staff_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.current_staff_role()) in ('admin', 'trabajador'));
drop policy if exists "product_images_staff_update" on storage.objects;
create policy "product_images_staff_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and (select public.current_staff_role()) in ('admin', 'trabajador'))
  with check (bucket_id = 'product-images' and (select public.current_staff_role()) in ('admin', 'trabajador'));
drop policy if exists "product_images_admin_delete" on storage.objects;
create policy "product_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (select public.current_staff_role()) = 'admin');

-- Limitar grants explícitamente: los clientes solo usan las tablas indicadas.
revoke all on public.profiles, public.products, public.orders, public.order_items from anon, authenticated;
grant select on public.products to anon, authenticated;
grant insert, update on public.products to authenticated;
grant delete on public.products to authenticated;
grant select on public.profiles, public.orders, public.order_items to authenticated;
grant update (estado) on public.orders to authenticated;

