# CHEROKEE AUTO PARTS

Sitio público para consultar repuestos, agregarlos al carrito y registrar pedidos. Incluye un panel privado para personal con permisos de administrador o trabajador. El checkout registra el pedido en Supabase y muestra el QR configurado; no procesa pagos.

## Tecnologías

- Vite y JavaScript (ES modules).
- Supabase Auth, Postgres, Row Level Security, Storage y Edge Functions.
- GitHub Actions y GitHub Pages para publicar el sitio estático.

## Requisitos

- Node.js 20.19+ o 22.12+ y npm.
- Un proyecto Supabase con permisos para ejecutar el esquema y gestionar usuarios.
- GitHub Pages habilitado para publicar desde GitHub Actions.

## Instalación

```bash
npm ci
```

## Configuración de Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta [`supabase/schema.sql`](supabase/schema.sql) en SQL Editor.
3. Crea el primer usuario en **Authentication → Users**. Luego promuévelo una sola vez desde SQL Editor:

   ```sql
   update public.profiles set rol = 'admin' where id = 'UUID-DEL-ADMIN';
   ```

4. Ejecuta la migración `supabase/migrations/20261125000100_worker_password_change.sql` en SQL Editor y despliega la función que gestiona las cuentas de trabajadores:

   ```bash
   supabase login
   supabase link --project-ref TU_PROJECT_REF
   supabase functions deploy manage-workers
   ```

   La función crea cuentas confirmadas con contraseña temporal. El trabajador debe cambiarla en su primer acceso. La clave administrativa solo se usa en el runtime de Supabase y nunca se incluye en el frontend.

5. En Storage, comprueba que exista el bucket `product-images` creado por el SQL.

Consulta [`supabase/README.md`](supabase/README.md) para los permisos y el proceso de configuración del personal.

## Variables de entorno

Copia `.env.example` a `.env.local` y configura los datos públicos del proyecto:

```dotenv
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=TU_PUBLISHABLE_KEY
VITE_PAYMENT_QR_IMAGE=
```

La URL debe ser la raíz del proyecto, sin `/rest/v1`. La clave publishable/anon está diseñada para frontend con RLS habilitado. Nunca pongas `service_role` ni una clave `secret` en variables `VITE_*`.

La imagen actual está en `imagenes/qr_code.jpg` y se incluye directamente en la compilación, sin editar ni recomprimir el archivo fuente. Para actualizarla, reemplaza ese archivo por la nueva imagen conservando el nombre y vuelve a compilar. Opcionalmente, define `VITE_PAYMENT_QR_IMAGE` con una URL HTTPS o el nombre de otra imagen guardada en `public/`. El área QR aparece después de registrar correctamente un pedido; el sitio no procesa pagos.

## Ejecución local

```bash
npm run dev
```

Abre la URL local que imprime Vite. El catálogo está en `/` y el panel en `/admin.html`. Para comprobar la versión compilada:

```bash
npm run build
npm run preview
```

## Publicación en GitHub Pages

1. Sube el proyecto a un repositorio GitHub. El workflow se ejecuta al actualizar `main` o `master` y calcula la ruta base desde el nombre real del repositorio; no hay que fijar a mano el slug.
2. En el repositorio, abre **Settings → Pages** y selecciona **GitHub Actions** como fuente.
3. En **Settings → Secrets and variables → Actions → Variables**, añade:
   - `VITE_SUPABASE_URL`: URL raíz del proyecto.
   - `VITE_SUPABASE_ANON_KEY`: clave publishable/anon.
   - `VITE_PAYMENT_QR_IMAGE`: opcional; vacío utiliza `imagenes/qr_code.jpg`. Para cambiarlo desde Actions, coloca otra imagen en `public/` y escribe su nombre aquí (por ejemplo, `qr-tienda.jpg`).
4. Asegúrate de que `imagenes/qr_code.jpg` esté incluido en el repositorio; Vite lo copiará como recurso optimizado para su ruta base, sin alterar la imagen original.
5. Cada push a la rama principal (`main` o `master`) ejecutará [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml), compilará `dist/` y publicará GitHub Pages. También puedes iniciar el flujo manualmente en **Actions**.

El frontend de GitHub Pages no necesita claves secretas. La Edge Function de Supabase debe desplegarse por separado y las credenciales de Auth Admin solo viven en el runtime de Supabase.

## Seguridad y comportamiento

- Productos activos: lectura pública. Pedidos: lectura solo para personal autenticado.
- Trabajadores pueden crear y editar productos y consultar pedidos. Administradores también gestionan estados de producto, estados de pedido y personal.
- La creación de pedido vuelve a validar precio y existencias dentro de una función SQL transaccional.
- El carrito se guarda en el navegador hasta que el pedido se registra correctamente.
- El QR se obtiene del archivo configurado; el sitio muestra el código, pero no realiza ni simula pagos.
