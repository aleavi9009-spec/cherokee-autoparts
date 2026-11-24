# Panel administrativo

El panel está disponible en `/admin.html`. Inicia sesión con Supabase Auth; después consulta `profiles` para validar rol y estado de la cuenta. La interfaz incluye resumen, gestión del catálogo, pedidos y, solo para administradores, gestión de trabajadores.

## Aplicar permisos

Vuelve a ejecutar `supabase/schema.sql` en el SQL Editor del proyecto. Añade `profiles.activo`, para cortar permisos RLS a cuentas desactivadas, y permite que solo los administradores actualicen el estado de pedidos. Trabajadores mantienen lectura de pedidos y gestión de productos según las políticas existentes.

## Desplegar la función de trabajadores

La invitación y el bloqueo de Auth requieren Auth Admin API. El frontend llama a `supabase/functions/manage-workers/index.ts`; la clave de servicio solo existe en el entorno seguro de Edge Functions.

1. Instala y autentica Supabase CLI para el proyecto.
2. Desde la raíz del repositorio enlaza el ref del proyecto: `supabase link --project-ref TU_PROJECT_REF`.
3. Despliega: `supabase functions deploy manage-workers`.
4. Configura `ALLOWED_ORIGIN` como el dominio del sitio (opcional para desarrollo local; por defecto acepta cualquier origen, pero cada petición exige JWT de administrador). Supabase provee las variables del proyecto y la clave administrativa al runtime de Edge Functions. No las agregues a `VITE_*` ni al frontend.
5. En **Authentication → URL Configuration**, añade el dominio del sitio en Site URL y Redirect URLs si vas a personalizar el destino del enlace de invitación.

La función verifica el JWT y consulta `profiles.rol` y `profiles.activo` en cada operación. Solo `admin` puede invitar, listar o desactivar/re-activar trabajadores. Desactivar también bloquea Auth y marca el perfil inactivo; RLS consulta ese estado en la función de rol.

## Acceso inicial

No existe registro público desde el panel. Crea el primer administrador en Supabase Auth y promueve su perfil desde SQL Editor (solo una vez):

```sql
update public.profiles set rol = 'admin' where id = 'UUID-DEL-ADMIN';
```

El enlace de acceso al panel está en el pie de la página pública o puede abrirse directamente en `/admin.html`.
