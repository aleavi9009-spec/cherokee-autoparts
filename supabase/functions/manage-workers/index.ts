import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function generateTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function validEmail(value: string) {
  return value.length <= 254 && /^\S+@\S+\.\S+$/.test(value)
}

function hasAdministratorMetadata(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }) {
  const roles = [
    user.app_metadata?.role,
    user.app_metadata?.rol,
    user.app_metadata?.staff_role,
  ].map((value) => String(value || '').toLowerCase())
  return roles.some((value) => ['admin', 'administrator', 'administrador'].includes(value))
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond({ error: 'Método no permitido.' }, 405)

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !anonKey || !serviceKey) {
    return respond({ error: 'No autorizado.' }, 401)
  }

  const token = authorization.slice('Bearer '.length)
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: authData, error: authError } = await authClient.auth.getUser(token)
  if (authError || !authData.user) return respond({ error: 'La sesión no es válida.' }, 401)

  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  let body: { action?: string; email?: string; nombre?: string; userId?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return respond({ error: 'Solicitud inválida.' }, 400)
  }

  const { data: actor, error: actorError } = await adminClient.from('profiles')
    .select('rol,activo,must_change_password').eq('id', authData.user.id).maybeSingle()

  if (body.action === 'complete-password-change') {
    if (actorError || actor?.rol !== 'trabajador' || actor.activo !== true || actor.must_change_password !== true) {
      return respond({ error: 'Esta cuenta no tiene un cambio de contraseña pendiente.' }, 403)
    }
    const password = String(body.password || '')
    if (password.length < 12 || password.length > 128) {
      return respond({ error: 'La nueva contraseña debe tener entre 12 y 128 caracteres.' }, 400)
    }

    let passwordResponse: Response
    try {
      passwordResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        method: 'PUT',
        headers: { apikey: anonKey, Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
    } catch {
      return respond({ error: 'No se pudo conectar con Supabase Auth para actualizar la contraseña.' }, 502)
    }
    if (!passwordResponse.ok) {
      const authFailure = await passwordResponse.json().catch(() => null)
      return respond({ error: authFailure?.msg || authFailure?.message || 'Supabase Auth rechazó la nueva contraseña.' }, 400)
    }

    const { data: changedProfile, error: profileError } = await adminClient.from('profiles')
      .update({ must_change_password: false }).eq('id', authData.user.id)
      .eq('rol', 'trabajador').eq('activo', true).eq('must_change_password', true)
      .select('id').maybeSingle()
    if (profileError || !changedProfile) {
      return respond({ error: 'La contraseña se actualizó, pero no se pudo confirmar el cambio en el perfil. Vuelve a intentarlo o contacta al administrador.' }, 500)
    }
    return respond({ message: 'Contraseña actualizada.' })
  }

  if (actorError || actor?.rol !== 'admin' || actor.activo !== true) {
    return respond({ error: 'Esta operación requiere una cuenta administradora activa.' }, 403)
  }

  if (body.action === 'list') {
    const profiles: Array<{
      id: string
      nombre: string
      email: string
      rol: string
      activo: boolean
      must_change_password: boolean
      fecha_creacion: string
    }> = []
    const profileIds: Array<{ id: string }> = []
    let profilesComplete = false
    for (let page = 0; page < 100; page++) {
      const start = page * 1000
      const [workerResult, profileIdResult] = await Promise.all([
        adminClient.from('profiles').select('id,nombre,email,rol,activo,must_change_password,fecha_creacion')
          .eq('rol', 'trabajador').order('nombre').range(start, start + 999),
        adminClient.from('profiles').select('id').range(start, start + 999),
      ])
      if (workerResult.error) return respond({ error: 'No se pudo consultar el personal.' }, 500)
      if (profileIdResult.error) return respond({ error: 'No se pudieron comprobar los perfiles existentes.' }, 500)
      profiles.push(...(workerResult.data || []))
      profileIds.push(...(profileIdResult.data || []))
      if ((workerResult.data || []).length < 1000 && (profileIdResult.data || []).length < 1000) {
        profilesComplete = true
        break
      }
    }
    if (!profilesComplete) return respond({ error: 'La lista de perfiles superó el límite de consulta; no se mostraron posibles cuentas incompletas.' }, 503)
    const users: Array<{
      id: string
      email?: string
      banned_until?: string
      app_metadata?: Record<string, unknown>
      user_metadata?: Record<string, unknown>
    }> = []
    let authUsersComplete = false
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 })
      if (error) return respond({ error: 'No se pudo consultar el estado de las cuentas.' }, 500)
      users.push(...data.users)
      if (data.users.length < 100) {
        authUsersComplete = true
        break
      }
    }
    if (!authUsersComplete) return respond({ error: 'La lista de usuarios Auth superó el límite de consulta; no se mostraron posibles cuentas incompletas.' }, 503)
    const authUsers = new Map(users.map(user => [user.id, user]))
    const profilesById = new Set(profileIds.map(profile => profile.id))
    return respond({ workers: (profiles || []).map(profile => ({
      ...profile,
      email: profile.email || authUsers.get(profile.id)?.email || '',
      activo: profile.activo && Boolean(authUsers.get(profile.id)) && !authUsers.get(profile.id)?.banned_until,
    })), orphanAccounts: users.filter(user => !profilesById.has(user.id)
      && user.id !== authData.user.id && !hasAdministratorMetadata(user))
      .map(user => ({
        id: user.id,
        email: user.email || '',
        nombre: String(user.user_metadata?.nombre || user.user_metadata?.name || user.user_metadata?.full_name || ''),
      })) })
  }

  if (body.action === 'reset-password') {
    const userId = String(body.userId || '')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return respond({ error: 'Identificador de trabajador inválido.' }, 400)
    }
    const { data: target, error: targetError } = await adminClient.from('profiles')
      .select('id,rol,activo,must_change_password').eq('id', userId).maybeSingle()
    if (targetError || !target || target.rol !== 'trabajador') {
      return respond({ error: 'Solo se puede restablecer la contraseña de un trabajador existente.' }, 404)
    }
    const { data: authResult, error: authLookupError } = await adminClient.auth.admin.getUserById(userId)
    if (authLookupError || !authResult.user) return respond({ error: 'No se encontró la cuenta Auth del trabajador.' }, 404)

    const { data: pendingProfile, error: flagError } = await adminClient.from('profiles')
      .update({ must_change_password: true }).eq('id', userId).eq('rol', 'trabajador')
      .select('id').maybeSingle()
    if (flagError || !pendingProfile) return respond({ error: 'No se pudo marcar el cambio obligatorio en el perfil.' }, 500)

    const temporaryPassword = generateTemporaryPassword()
    const { error: passwordError } = await adminClient.auth.admin.updateUserById(userId, { password: temporaryPassword })
    if (passwordError) {
      if (target.must_change_password !== true) {
        const { error: rollbackError } = await adminClient.from('profiles').update({ must_change_password: false })
          .eq('id', userId).eq('rol', 'trabajador').eq('must_change_password', true)
        if (rollbackError) {
          return respond({ error: 'Auth no pudo actualizar la contraseña y no se pudo revertir el estado del perfil. El trabajador puede quedar bloqueado; vuelve a intentar el restablecimiento.' }, 500)
        }
      }
      return respond({ error: `No se pudo restablecer la contraseña: ${passwordError.message}` }, 400)
    }
    return respond({ id: userId, temporaryPassword, message: 'Contraseña temporal restablecida.' })
  }

  if (body.action === 'repair-profile') {
    const userId = String(body.userId || '')
    const nombre = String(body.nombre || '').trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
      || nombre.length < 2 || nombre.length > 120) {
      return respond({ error: 'Selecciona una cuenta y escribe un nombre válido.' }, 400)
    }
    if (userId === authData.user.id) return respond({ error: 'No se puede reparar la cuenta administradora actual como trabajador.' }, 400)

    const { data: authResult, error: authLookupError } = await adminClient.auth.admin.getUserById(userId)
    if (authLookupError || !authResult.user) return respond({ error: 'La cuenta Auth seleccionada ya no existe.' }, 404)
    const email = authResult.user.email || ''
    if (!validEmail(email) || hasAdministratorMetadata(authResult.user)) {
      return respond({ error: 'Esta cuenta no puede registrarse como trabajador. Revisa su correo y rol de Auth.' }, 403)
    }

    const { data: existingProfile, error: existingProfileError } = await adminClient.from('profiles')
      .select('id,rol').eq('id', userId).maybeSingle()
    if (existingProfileError) return respond({ error: 'No se pudo comprobar el perfil actual.' }, 500)
    if (existingProfile) return respond({ error: 'La cuenta ya tiene un perfil. No se modificó ningún dato.' }, 409)

    const { error: insertError } = await adminClient.from('profiles').insert({
      id: authResult.user.id,
      nombre,
      email,
      rol: 'trabajador',
      activo: true,
      must_change_password: true,
    })
    if (insertError) {
      const status = insertError.code === '23505' ? 409 : 500
      return respond({ error: status === 409 ? 'El perfil ya existe o hay un registro con ese identificador. No se modificó ningún dato.' : 'No se pudo crear el perfil del trabajador.' }, status)
    }
    return respond({ id: authResult.user.id, message: 'Perfil de trabajador reparado. Debe cambiar la contraseña al iniciar sesión.' }, 201)
  }

  if (body.action === 'create') {
    const email = String(body.email || '').trim().toLowerCase()
    const nombre = String(body.nombre || '').trim()
    if (!validEmail(email) || nombre.length < 2 || nombre.length > 120) {
      return respond({ error: 'Ingresa un nombre y un correo válidos.' }, 400)
    }

    let emailAlreadyExists = false
    let usersListedCompletely = false
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 })
      if (error) return respond({ error: 'No se pudo comprobar si el correo ya está registrado.' }, 500)
      if (data.users.some((user) => user.email?.toLowerCase() === email)) {
        emailAlreadyExists = true
        usersListedCompletely = true
        break
      }
      if (data.users.length < 100) {
        usersListedCompletely = true
        break
      }
    }
    if (!usersListedCompletely) return respond({ error: 'No se pudo completar la comprobación de cuentas. Inténtalo de nuevo.' }, 503)
    if (emailAlreadyExists) return respond({ error: 'Ese correo electrónico ya está registrado en el sistema.' }, 409)

    const temporaryPassword = generateTemporaryPassword()
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { nombre },
      app_metadata: { must_change_password: true },
    })
    if (createError || !created.user) {
      const duplicate = /already|exists|registered|duplicate/i.test(createError?.message || '')
      return respond({ error: duplicate ? 'Ese correo electrónico ya está registrado en el sistema.' : (createError?.message || 'No se pudo crear la cuenta de trabajador.') }, duplicate ? 409 : 400)
    }

    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: created.user.id,
      nombre,
      email,
      rol: 'trabajador',
      activo: true,
      must_change_password: true,
    }, { onConflict: 'id' })
    if (profileError) {
      await adminClient.auth.admin.updateUserById(created.user.id, { ban_duration: '876000h' })
      return respond({ error: 'La cuenta se creó, pero no se pudo guardar su perfil. El acceso quedó bloqueado; contacta al administrador antes de volver a intentarlo.' }, 500)
    }
    return respond({ id: created.user.id, temporaryPassword, message: 'Cuenta de trabajador creada.' }, 201)
  }

  if (body.action === 'update') {
    const userId = String(body.userId || '')
    const nombre = String(body.nombre || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
      || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || nombre.length < 2 || nombre.length > 120) {
      return respond({ error: 'Ingresa un trabajador, nombre y correo válidos.' }, 400)
    }
    const { data: target, error: targetError } = await adminClient.from('profiles')
      .select('id,rol,nombre,email').eq('id', userId).maybeSingle()
    if (targetError || !target || target.rol !== 'trabajador') {
      return respond({ error: 'No se encontró un trabajador para esa cuenta.' }, 404)
    }

    const { data: authResult, error: authLookupError } = await adminClient.auth.admin.getUserById(userId)
    if (authLookupError || !authResult.user) return respond({ error: 'No se pudo verificar la cuenta del trabajador.' }, 404)
    const previousUser = authResult.user
    const authUpdates: { email?: string; user_metadata: Record<string, unknown> } = {
      user_metadata: { ...previousUser.user_metadata, nombre },
    }
    if (email !== previousUser.email?.toLowerCase()) authUpdates.email = email
    const { error: profileUpdateError } = await adminClient.from('profiles')
      .update({ nombre }).eq('id', userId).eq('rol', 'trabajador')
    if (profileUpdateError) return respond({ error: 'No se pudieron guardar los datos del trabajador.' }, 500)

    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, authUpdates)
    if (authUpdateError) {
      await adminClient.from('profiles').update({ nombre: target.nombre }).eq('id', userId).eq('rol', 'trabajador')
      return respond({ error: authUpdateError.message }, 400)
    }
    return respond({ message: 'Datos del trabajador actualizados.' })
  }

  if (body.action === 'deactivate' || body.action === 'reactivate') {
    const userId = String(body.userId || '')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return respond({ error: 'Identificador de trabajador inválido.' }, 400)
    }
    if (userId === authData.user.id) return respond({ error: 'No puedes desactivar tu propia cuenta.' }, 400)
    const { data: target, error: targetError } = await adminClient.from('profiles')
      .select('id,rol,activo').eq('id', userId).maybeSingle()
    if (targetError || !target || target.rol !== 'trabajador') {
      return respond({ error: 'No se encontró un trabajador para esa cuenta.' }, 404)
    }

    if (body.action === 'deactivate') {
      const { error: profileError } = await adminClient.from('profiles').update({ activo: false }).eq('id', userId)
      if (profileError) return respond({ error: 'No se pudo desactivar el acceso.' }, 500)
      const { error: banError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
      if (banError) {
        await adminClient.from('profiles').update({ activo: true }).eq('id', userId)
        return respond({ error: 'No se pudo desactivar la cuenta.' }, 500)
      }
    } else {
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' })
      if (unbanError) return respond({ error: 'No se pudo reactivar la cuenta.' }, 500)
      const { error: profileError } = await adminClient.from('profiles').update({ activo: true }).eq('id', userId)
      if (profileError) {
        await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
        return respond({ error: 'No se pudo reactivar el acceso.' }, 500)
      }
    }
    return respond({ message: body.action === 'deactivate' ? 'Trabajador desactivado.' : 'Trabajador reactivado.' })
  }

  return respond({ error: 'Acción no reconocida.' }, 400)
})
