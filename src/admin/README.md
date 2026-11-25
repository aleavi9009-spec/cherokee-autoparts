# Panel administrativo

El panel está disponible en `/admin.html`. Supabase Auth valida la sesión y `profiles` determina el rol y el estado. La sección Trabajadores está disponible solo para administradores.

## Migración de contraseña temporal

Antes de publicar el frontend o desplegar `manage-workers`, ejecuta el contenido de `supabase/migrations/20261125000100_worker_password_change.sql` en el SQL Editor del proyecto. La migración agrega `profiles.must_change_password` y bloquea las políticas RLS de trabajadores mientras tengan pendiente el cambio. Los administradores y cuentas existentes conservan su acceso.

`supabase/schema.sql` también incluye el esquema actualizado para instalaciones nuevas.

## Crear cuentas de trabajadores

El administrador crea la cuenta desde Trabajadores con nombre y correo. `manage-workers` comprueba duplicados, crea un usuario confirmado mediante Auth Admin API, asigna el rol `trabajador` y muestra una contraseña temporal aleatoria una sola vez. También permite restablecer la contraseña temporal de un trabajador existente y reparar perfiles ausentes para usuarios Auth seleccionados; la reparación conserva el UUID y correo, y usa `INSERT` para no sobrescribir perfiles existentes. En ambos casos el trabajador debe cambiar la contraseña al iniciar sesión. La clave `SUPABASE_SERVICE_ROLE_KEY` solo se usa dentro de la Edge Function.

Desde la raíz del proyecto, con Supabase CLI instalado:

```sh
supabase login
supabase link --project-ref eznpkrvnkldtjqitnplz
supabase functions deploy manage-workers
```

`supabase/config.toml` mantiene `verify_jwt = true`. La función comprueba el JWT y el perfil en cada solicitud. Solo un administrador activo puede crear, listar, editar, restablecer contraseñas temporales, reparar perfiles ausentes y activar o desactivar trabajadores. El propio trabajador puede completar el cambio pendiente de contraseña; la función actualiza Auth primero y marca el perfil como completado solo después del éxito. No puede cambiar su rol.

Supabase provee `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` al runtime. No agregues la clave de servicio a `.env.local`, variables `VITE_*` ni al frontend. Si se define `ALLOWED_ORIGIN`, configúralo con `https://aleavi9009-spec.github.io`; de lo contrario la función conserva CORS `*` y sigue exigiendo JWT y autorización por perfil.

Para cambios de correo del trabajador, ejecuta una vez `supabase/worker_email_sync.sql` en SQL Editor. No hay columnas de nombre de usuario ni cargo en el esquema actual; el formulario guarda el nombre en `profiles.nombre`.

## Acceso inicial

Crea el primer administrador en Supabase Auth y promueve su perfil desde SQL Editor (solo una vez):

```sql
update public.profiles set rol = 'admin' where id = 'UUID-DEL-ADMIN';
```

El acceso está en el pie de la página pública o en `/admin.html`. Después de ejecutar la migración y desplegar la función, publica el resultado de `npm run build` en GitHub Pages.
