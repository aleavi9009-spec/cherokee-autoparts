# Configurar Supabase para CHEROKEE AUTO PARTS

El esquema está en [`schema.sql`](./schema.sql). No se conecta automáticamente al proyecto de Supabase ni agrega datos de productos. El cliente web ya está preparado en `src/services/supabaseClient.js` para recibir la URL y la clave pública (`publishable` o `anon`) mediante variables de entorno.

## 1. Crear el proyecto

1. En [Supabase](https://supabase.com/dashboard), crea un proyecto y guarda la contraseña de base de datos en un gestor seguro.
2. Espera a que termine la creación. En **Project Settings → API** copia **Project URL** y la clave pública **Publishable key** (en proyectos antiguos aparece como `anon`).
3. No copies `service_role` ni claves `secret` al frontend, a `.env.local` o a Git. La clave pública está diseñada para usarse desde el navegador; RLS es la barrera de acceso.

## 2. Instalar tablas, RLS y Storage

1. Abre el proyecto → **SQL Editor** → **New query**.
2. Copia el contenido completo de `supabase/schema.sql`, ejecútalo y comprueba que la consulta termine sin errores.
3. En **Storage**, confirma que existe el bucket `product-images`. El bucket es público solo para lectura de imágenes; subir, reemplazar y eliminar requieren sesión y perfil de trabajador/admin.

El script crea `profiles`, `products`, `orders` y `order_items`, sus índices, el trigger de perfiles, políticas RLS y la función `place_order`. No hace falta exponer los pedidos al público: el cliente anónimo no tiene permisos para leer las tablas ni escribirlas directamente. `place_order` valida los productos, usa precios de la base, bloquea filas durante la compra y descuenta stock en la misma transacción. Devuelve el identificador y el resumen con los importes calculados por la base de datos.

Si ya ejecutaste una versión anterior del script, vuelve a ejecutar el archivo completo para actualizar la función `place_order` y sus políticas. Las tablas existentes se conservan.

## 3. Crear el primer administrador con seguridad

No habilites el registro público de usuarios.

1. En **Authentication → Users**, usa **Add user** para crear tu cuenta con un correo propio y una contraseña segura (o invita el correo desde el panel). No guardes la contraseña en la tabla `profiles`; Supabase Auth la gestiona.
2. Copia el UUID de ese usuario desde la lista de usuarios.
3. En SQL Editor ejecuta lo siguiente, reemplazando el UUID por el valor copiado:

```sql
update public.profiles
set rol = 'admin'
where id = 'UUID-DEL-USUARIO-CREADO';
```

4. Inicia sesión con esa cuenta. El alta de usuario dispara el trigger, que crea el perfil con rol `trabajador`; el paso manual anterior lo eleva a administrador. El cambio de rol no está disponible mediante la API del navegador.

## 4. Registrar trabajadores

La pestaña **Trabajadores** invita y administra cuentas mediante la Edge Function `manage-workers`. El trigger crea cada perfil invitado como `trabajador`. La clave `service_role` permanece únicamente en el entorno de Edge Functions; ningún cliente puede cambiar roles ni crear perfiles con privilegios. Para sincronizar correos editados luego de confirmarlos en Auth, ejecuta una vez `worker_email_sync.sql` en SQL Editor.

## 5. Conectar el frontend

En la raíz del proyecto crea `.env.local` (está ignorado por Git) con:

```dotenv
VITE_SUPABASE_URL=https://TU-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=TU-PUBLISHABLE-KEY
```

Puedes copiar `.env.example` como base. Detén y vuelve a iniciar `npm run dev` para que Vite cargue las variables. La clave pública puede aparecer en el bundle del frontend; no pongas una `service_role`/`secret` ahí.

## 6. Cómo se aplican los permisos

- El público consulta productos cuyo `estado` sea `activo`; el personal autenticado también puede consultar inactivos.
- Administradores y trabajadores pueden crear/editar datos de productos y cargar imágenes. Solo el administrador puede activar/desactivar productos, borrar filas o archivos.
- Administradores y trabajadores pueden consultar pedidos. Solo la función `place_order` puede insertar un pedido y sus líneas desde el flujo público; la actualización de pedidos queda reservada a una futura operación controlada del panel.
- Los pedidos no tienen política pública de lectura. Las líneas no revelan información a usuarios anónimos.
- Cada cuenta ve su propio perfil; el administrador puede leer todos. Ningún perfil puede cambiar su rol mediante permisos de cliente.
- El bucket permite lectura pública de imágenes. No publiques allí documentos privados.

## Nota sobre políticas y permisos de personal

Este SQL cubre la base, Auth, RLS, creación pública de pedidos y almacenamiento. La gestión de invitaciones y cuentas usa la Edge Function protegida `manage-workers`; consulta `src/admin/README.md` para desplegarla. No llames Auth Admin API desde el frontend.
