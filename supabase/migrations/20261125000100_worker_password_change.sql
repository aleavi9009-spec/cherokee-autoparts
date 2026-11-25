-- Cherokee Auto Parts: contraseña temporal obligatoria para cuentas nuevas de trabajadores.
-- Reejecutable: agrega/normaliza la columna antes de cualquier referencia a ella.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- Las cuentas existentes conservan acceso. Limpia valores nulos de una columna
-- preexistente y evita que una cuenta administradora quede bloqueada por accidente.
update public.profiles
set must_change_password = false
where must_change_password is null
   or (rol = 'admin' and must_change_password is distinct from false);

alter table public.profiles
  alter column must_change_password set default false,
  alter column must_change_password set not null;

-- Las cuentas creadas por manage-workers llevan esta marca en app_metadata,
-- que solo puede escribir un administrador mediante Auth Admin API.
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

-- Mantiene un único trigger de creación de perfil; se puede ejecutar de nuevo.
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Las políticas existentes de productos, pedidos, líneas y archivos usan esta
-- función. Los trabajadores pendientes reciben NULL y no pasan esas políticas;
-- administradores activos conservan su rol. El trabajador aún puede leer su
-- propia fila de profiles y completar el cambio por la Edge Function autenticada.
create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol
  from public.profiles p
  where p.id = (select auth.uid())
    and p.activo
    and (p.rol = 'admin' or not p.must_change_password)
$$;

revoke all on function public.current_staff_role() from public, anon;
grant execute on function public.current_staff_role() to authenticated;
