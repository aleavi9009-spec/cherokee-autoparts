-- Ejecutar una sola vez en Supabase SQL Editor.
-- Sincroniza profiles.email solo cuando Auth confirma un cambio de correo.
create or replace function public.sync_auth_user_email_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set email = coalesce(new.email, ''),
        nombre = coalesce(new.raw_user_meta_data ->> 'nombre', nombre)
    where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_auth_user_email_to_profile() from public, anon, authenticated;
drop trigger if exists on_auth_user_email_updated_profile on auth.users;
create trigger on_auth_user_email_updated_profile
  after update of email on auth.users
  for each row execute procedure public.sync_auth_user_email_to_profile();
