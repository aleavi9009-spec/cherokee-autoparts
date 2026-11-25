# Panel administrativo

El panel está disponible en `/admin.html`. Inicia sesión con Supabase Auth; después consulta `profiles` para validar rol y estado de la cuenta. La interfaz incluye resumen, gestión del catálogo, pedidos y, solo para administradores, gestión de trabajadores.

## Aplicar permisos

Vuelve a ejecutar `supabase/schema.sql` en el SQL Editor del proyecto. Añade `profiles.activo`, para cortar permisos RLS a cuentas desactivadas, y permite que solo los administradores actualicen el estado de pedidos. Trabajadores mantienen lectura de pedidos y gestión de productos según las políticas existentes.

## Desplegar la función de trabajadores

El proyecto remoto respondió `404 NOT_FOUND` para `manage-workers`: la función existe en el repositorio, pero debe desplegarse para que la pestaña pueda cargar. `profiles` ya incluye `nombre`, `email`, `rol`, `activo` y `fecha_creacion`; no se necesitan tablas ni columnas nuevas para el módulo. Para sincronizar los cambios de correo solo después de su confirmación en Auth, ejecuta una vez `supabase/worker_email_sync.sql` en SQL Editor. No hay columnas de nombre de usuario ni cargo en el esquema actual, así que el formulario no inventa ni guarda esos campos. El rol para cuentas nuevas siempre es `trabajador`.

Desde la raíz del proyecto, con Supabase CLI instalado, ejecuta:

```sh
supabase login
supabase link --project-ref eznpkrvnkldtjqitnplz
supabase functions deploy manage-workers
```

`supabase/config.toml` mantiene `verify_jwt = true`; la función vuelve a validar el usuario y comprueba `profiles.rol = 'admin'` y `activo = true` antes de cada operación. Supabase provee `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` al runtime. La clave de servicio nunca debe agregarse a `.env.local`, variables `VITE_*` ni al frontend.

Configura `ALLOWED_ORIGIN` con el origen del sitio (por ejemplo, `https://tudominio.com`) si quieres restringir CORS; si no se define, la función acepta orígenes web y sigue exigiendo JWT y rol administrador. En **Authentication → URL Configuration**, revisa `Site URL` y `Redirect URLs` para el dominio donde el trabajador completará la invitación.

La función verifica el JWT y consulta `profiles.rol` y `profiles.activo` en cada operación. Solo `admin` puede invitar, listar, editar datos o desactivar/reactivar perfiles con rol `trabajador`. Desactivar bloquea Auth y marca el perfil inactivo; RLS consulta ese estado en la función de rol. No puede editar, elevar ni desactivar perfiles administradores.

## Acceso inicial

No existe registro público desde el panel. Crea el primer administrador en Supabase Auth y promueve su perfil desde SQL Editor (solo una vez):

```sql
update public.profiles set rol = 'admin' where id = 'UUID-DEL-ADMIN';
```

El enlace de acceso al panel está en el pie de la página pública o puede abrirse directamente en `/admin.html`.

## Invitaciones en GitHub Pages

La Edge Function dirige las invitaciones a `https://aleavi9009-spec.github.io/cherokee-autoparts/?auth=invite`. Después de confirmar el enlace, la página pública procesa la sesión, verifica que el perfil activo tenga rol `trabajador` y permite establecer la contraseña. Tras guardarla, cierra la sesión para que el trabajador inicie sesión en `/cherokee-autoparts/admin.html`.

En Supabase **Authentication → URL Configuration → Redirect URLs**, permite `https://aleavi9009-spec.github.io/cherokee-autoparts/**`. Revisa también **Authentication → Email Templates → Invite user**: conserva el enlace `{{ .ConfirmationURL }}` o usa `{{ .RedirectTo }}` como destino. No construyas el enlace con `{{ .SiteURL }}`; si la URL no está permitida o el template ignora `RedirectTo`, Supabase puede recurrir a `Site URL` (que actualmente apunta a localhost). Cada cambio a `manage-workers` requiere volver a desplegarla.
