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
  const { data: actor, error: actorError } = await adminClient.from('profiles')
    .select('rol,activo').eq('id', authData.user.id).maybeSingle()
  if (actorError || actor?.rol !== 'admin' || actor.activo !== true) {
    return respond({ error: 'Esta operación requiere una cuenta administradora activa.' }, 403)
  }

  let body: { action?: string; email?: string; nombre?: string; userId?: string }
  try {
    body = await request.json()
  } catch {
    return respond({ error: 'Solicitud inválida.' }, 400)
  }

  if (body.action === 'list') {
    const { data: profiles, error: profilesError } = await adminClient.from('profiles')
      .select('id,nombre,email,rol,activo,fecha_creacion').eq('rol', 'trabajador').order('nombre')
    if (profilesError) return respond({ error: 'No se pudo consultar el personal.' }, 500)

    const users = []
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 })
      if (error) return respond({ error: 'No se pudo consultar el estado de las cuentas.' }, 500)
      users.push(...data.users)
      if (data.users.length < 100) break
    }
    const authUsers = new Map(users.map(user => [user.id, user]))
    return respond({ workers: (profiles || []).map(profile => ({
      ...profile,
      email: profile.email || authUsers.get(profile.id)?.email || '',
      activo: profile.activo && Boolean(authUsers.get(profile.id)) && !authUsers.get(profile.id)?.banned_until,
    })) })
  }

  if (body.action === 'invite') {
    const email = String(body.email || '').trim().toLowerCase()
    const nombre = String(body.nombre || '').trim()
    if (!/^\S+@\S+\.\S+$/.test(email) || nombre.length < 2 || nombre.length > 120) {
      return respond({ error: 'Ingresa un nombre y un correo válidos.' }, 400)
    }
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, { data: { nombre } })
    if (error) return respond({ error: error.message }, 400)
    return respond({ id: data.user.id, message: 'Invitación enviada.' }, 201)
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
