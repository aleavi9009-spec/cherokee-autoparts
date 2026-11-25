import '../styles/main.css'
import './admin.css'
import { supabase } from '../services/supabaseClient.js'
import { escapeHTML, money } from '../components/App.js'

const root = document.querySelector('#admin-app')
const e = escapeHTML
const base = import.meta.env.BASE_URL
const states = ['pendiente', 'confirmado', 'preparando', 'completado', 'cancelado']
let currentUser = null
let role = null
let pendingPasswordUser = null
let page = 'dashboard'
let products = []
let workers = []
let orphanAccounts = []

function message(text, type = '') {
  const target = document.querySelector('[data-admin-message]')
  if (!target) return
  target.textContent = text
  target.className = `admin-message ${type}`
}

function loginView(note = '') {
  root.innerHTML = `<main class="login-page"><a class="brand" href="${base}" aria-label="Volver al catálogo"><span class="brand__mark">C<span>.</span></span><span class="brand__name">CHEROKEE <small>AUTO PARTS</small></span></a><form class="login-card" data-login-form><p class="admin-eyebrow">ACCESO PARA PERSONAL</p><h1>Iniciar sesión</h1><p>Ingresa con la cuenta autorizada de CHEROKEE AUTO PARTS.</p>${note ? `<div class="admin-alert">${e(note)}</div>` : ''}<label>Correo electrónico<input name="email" type="email" autocomplete="username" required/></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required/></label><button class="admin-primary" type="submit">Ingresar</button><a class="back-link" href="${base}">← Volver a la tienda</a></form></main>`
  document.querySelector('[data-login-form]').addEventListener('submit', signIn)
}

function shell() {
  const admin = role === 'admin'
  root.innerHTML = `<div class="admin-shell"><aside class="admin-sidebar"><a class="brand" href="${base}" aria-label="Cherokee Auto Parts"><span class="brand__mark">C<span>.</span></span><span class="brand__name">CHEROKEE <small>ADMINISTRACIÓN</small></span></a><nav aria-label="Panel administrativo"><button data-page="dashboard">Resumen</button><button data-page="products">Productos</button><button data-page="orders">Pedidos</button>${admin ? '<button data-page="team">Trabajadores</button>' : ''}</nav><a class="back-link" href="${base}">← Ver tienda</a></aside><main class="admin-main"><header class="admin-topbar"><div><span class="admin-eyebrow">PANEL DE CONTROL</span><h1 data-page-title>Resumen</h1></div><div class="admin-user"><span>${e(currentUser?.email || '')} · ${admin ? 'Administrador' : 'Trabajador'}</span><button type="button" data-sign-out>Cerrar sesión</button></div></header><div class="admin-message" data-admin-message role="status"></div><section class="admin-content" data-admin-content></section></main></div>`
  root.querySelector(`[data-page="${page}"]`)?.classList.add('is-active')
  root.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)))
  root.querySelector('[data-sign-out]').addEventListener('click', signOut)
  navigate(page)
}

function navigate(nextPage) {
  if (nextPage === 'team' && role !== 'admin') return
  page = nextPage
  root.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('is-active', button.dataset.page === page))
  const titles = { dashboard: 'Resumen', products: 'Productos', orders: 'Pedidos', team: 'Trabajadores' }
  root.querySelector('[data-page-title]').textContent = titles[page]
  message('')
  if (page === 'dashboard') loadDashboard()
  if (page === 'products') loadProducts()
  if (page === 'orders') loadOrders()
  if (page === 'team') loadWorkers()
}

async function signIn(event) {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  const button = event.currentTarget.querySelector('button')
  button.disabled = true
  button.textContent = 'Validando…'
  const { data, error } = await supabase.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') })
  if (error) {
    loginView('No se pudo iniciar sesión. Revisa el correo y la contraseña.')
    return
  }
  await verifyAndRender(data.user)
}

async function verifyAndRender(user) {
  if (!supabase || !user) return loginView('No hay una sesión activa.')
  const { data: profile, error } = await supabase.from('profiles').select('rol,activo,must_change_password').eq('id', user.id).maybeSingle()
  if (error || !profile || !profile.activo || !['admin', 'trabajador'].includes(profile.rol)) {
    await supabase.auth.signOut()
    currentUser = null
    role = null
    return loginView('Esta cuenta no tiene permisos para acceder al panel.')
  }
  currentUser = user
  role = profile.rol
  if (profile.rol === 'trabajador' && profile.must_change_password) return passwordSetupView(user)
  pendingPasswordUser = null
  shell()
}

function passwordSetupView(user, errorMessage = '') {
  pendingPasswordUser = user
  root.innerHTML = `<main class="login-page"><a class="brand" href="${base}" aria-label="Cherokee Auto Parts"><span class="brand__mark">C<span>.</span></span><span class="brand__name">CHEROKEE <small>AUTO PARTS</small></span></a><section class="login-card password-setup-card"><p class="admin-eyebrow">ACTIVA TU ACCESO</p><h1>Cambia tu contraseña temporal</h1><p>Antes de continuar, establece una contraseña personal para ${e(user.email || 'tu cuenta')}.</p>${errorMessage ? `<div class="admin-alert">${e(errorMessage)}</div>` : ''}<form data-password-setup-form><label>Nueva contraseña<div class="admin-password-field"><input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required/><button type="button" data-password-toggle>Mostrar</button></div></label><label>Confirmar contraseña<div class="admin-password-field"><input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required/><button type="button" data-password-toggle>Mostrar</button></div></label><small>Usa entre 12 y 128 caracteres.</small><button class="admin-primary" type="submit">Establecer contraseña</button></form><button class="password-setup-signout" type="button" data-password-signout>Cerrar sesión</button></section></main>`
  const form = root.querySelector('[data-password-setup-form]')
  form.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = button.parentElement.querySelector('input')
    input.type = input.type === 'password' ? 'text' : 'password'
    button.textContent = input.type === 'password' ? 'Mostrar' : 'Ocultar'
  }))
  form.addEventListener('submit', completePasswordChange)
  root.querySelector('[data-password-signout]').addEventListener('click', signOut)
}

async function completePasswordChange(event) {
  event.preventDefault()
  const form = event.currentTarget
  const password = form.elements.password.value
  const confirmation = form.elements.confirmation.value
  const button = form.querySelector('[type="submit"]')
  if (password.length < 12 || password.length > 128) return passwordSetupView(pendingPasswordUser, 'La contraseña debe tener entre 12 y 128 caracteres.')
  if (password !== confirmation) return passwordSetupView(pendingPasswordUser, 'Las contraseñas no coinciden.')
  button.disabled = true
  button.textContent = 'Actualizando…'
  try {
    await workerRequest({ action: 'complete-password-change', password })
  } catch (error) {
    passwordSetupView(pendingPasswordUser, error.message || 'No se pudo actualizar la contraseña. Inténtalo de nuevo.')
    return
  }
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    await supabase.auth.signOut()
    currentUser = null
    role = null
    return loginView('La contraseña se actualizó. Inicia sesión con tu nueva contraseña para continuar.')
  }
  await verifyAndRender(data.user)
}

async function signOut() {
  await supabase.auth.signOut()
  currentUser = null
  role = null
  loginView()
}

async function loadDashboard() {
  const content = root.querySelector('[data-admin-content]')
  content.innerHTML = '<p class="admin-loading">Cargando resumen…</p>'
  const [productResult, orderResult] = await Promise.all([
    supabase.from('products').select('id,stock,estado'),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
  ])
  if (productResult.error || orderResult.error) return message('No se pudo cargar el resumen. Comprueba los permisos de base de datos.', 'is-error')
  const all = productResult.data || []
  const available = all.filter(product => product.estado === 'activo' && Number(product.stock) > 0).length
  const outOfStock = all.filter(product => Number(product.stock) === 0).length
  content.innerHTML = `<div class="metric-grid"><article class="metric-card"><span>Productos registrados</span><strong>${all.length}</strong></article><article class="metric-card"><span>Productos disponibles</span><strong>${available}</strong></article><article class="metric-card"><span>Sin existencias</span><strong>${outOfStock}</strong></article><article class="metric-card"><span>Pedidos recibidos</span><strong>${orderResult.count || 0}</strong></article></div><div class="admin-welcome"><p class="admin-eyebrow">CHEROKEE AUTO PARTS</p><h2>Bienvenido al panel</h2><p>Administra el catálogo y revisa los pedidos desde el menú.</p><button class="admin-primary" data-go-products>Gestionar productos</button></div>`
  content.querySelector('[data-go-products]').addEventListener('click', () => navigate('products'))
}

async function loadProducts() {
  const content = root.querySelector('[data-admin-content]')
  content.innerHTML = '<p class="admin-loading">Cargando productos…</p>'
  const { data, error } = await supabase.from('products').select('*').order('fecha_actualizacion', { ascending: false })
  if (error) return message('No se pudo consultar los productos.', 'is-error')
  products = data || []
  const canManageState = role === 'admin'
  content.innerHTML = `<div class="admin-section-head"><div><h2>Catálogo</h2><p>Registra y actualiza los productos de la tienda.</p></div><button class="admin-primary" data-new-product>+ Nuevo producto</button></div><div class="product-admin-layout"><form class="admin-card product-form" data-product-form><h3 data-product-form-title>Nuevo producto</h3><input type="hidden" name="id"/><label>Nombre<input name="nombre" required maxlength="160"/></label><div class="form-two"><label>Marca<input name="marca" maxlength="100"/></label><label>Categoría<input name="categoria" required maxlength="100"/></label></div><label>Descripción<textarea name="descripcion" rows="3"></textarea></label><div class="form-two"><label>Precio (Bs)<input name="precio" type="number" required min="0" step="0.01"/></label><label>Existencias<input name="stock" type="number" required min="0" step="1"/></label></div>${canManageState ? '<label>Estado<select name="estado"><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></label>' : ''}<label>Fotografía<input name="image" type="file" accept="image/jpeg,image/png,image/webp"/></label><small>JPG, PNG o WebP · máximo 5 MB</small><div class="form-actions"><button class="admin-secondary" type="button" data-cancel-product hidden>Cancelar</button><button class="admin-primary" type="submit">Guardar producto</button></div></form><div class="admin-card product-list"><div class="admin-list-head"><h3>Productos registrados</h3><span>${products.length} productos</span></div>${products.length ? products.map(product => `<article class="product-admin-row"><div class="product-admin-info"><strong>${e(product.nombre)}</strong><span>${e(product.marca || 'Sin marca')} · ${e(product.categoria)} · ${money(product.precio)} · Stock ${Number(product.stock)}</span><span class="status-pill ${product.estado === 'activo' ? 'is-good' : 'is-muted'}">${product.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></div><div class="row-actions"><button type="button" data-edit-product="${e(product.id)}">Editar</button>${canManageState ? `<button type="button" data-toggle-product="${e(product.id)}">${product.estado === 'activo' ? 'Desactivar' : 'Activar'}</button><button type="button" class="danger-link" data-delete-product="${e(product.id)}">Eliminar</button>` : ''}</div></article>`).join('') : '<p class="admin-empty">Todavía no hay productos registrados.</p>'}</div></div>`
  const form = content.querySelector('[data-product-form]')
  form.addEventListener('submit', saveProduct)
  content.querySelector('[data-new-product]').addEventListener('click', () => resetProductForm(form))
  content.querySelector('[data-cancel-product]').addEventListener('click', () => resetProductForm(form))
  content.querySelectorAll('[data-edit-product]').forEach(button => button.addEventListener('click', () => editProduct(form, button.dataset.editProduct)))
  content.querySelectorAll('[data-toggle-product]').forEach(button => button.addEventListener('click', () => toggleProduct(button.dataset.toggleProduct)))
  content.querySelectorAll('[data-delete-product]').forEach(button => button.addEventListener('click', () => deleteProduct(button.dataset.deleteProduct)))
}

function resetProductForm(form) {
  form.reset()
  form.elements.id.value = ''
  form.querySelector('[data-product-form-title]').textContent = 'Nuevo producto'
  form.querySelector('[data-cancel-product]').hidden = true
}

function editProduct(form, id) {
  const product = products.find(item => item.id === id)
  if (!product) return
  for (const field of ['id', 'nombre', 'marca', 'categoria', 'descripcion', 'precio', 'stock', 'estado']) {
    if (form.elements[field]) form.elements[field].value = product[field] ?? ''
  }
  form.querySelector('[data-product-form-title]').textContent = `Editar: ${product.nombre}`
  form.querySelector('[data-cancel-product]').hidden = false
  form.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function saveProduct(event) {
  event.preventDefault()
  const form = event.currentTarget
  const data = new FormData(form)
  const id = String(data.get('id') || '')
  const original = products.find(item => item.id === id)
  const button = form.querySelector('[type="submit"]')
  button.disabled = true
  button.textContent = 'Guardando…'
  let imageUrl = original?.imagen_url || null
  const image = data.get('image')
  if (image instanceof File && image.size) {
    if (image.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
      message('La foto debe ser JPG, PNG o WebP y pesar menos de 5 MB.', 'is-error')
      button.disabled = false
      button.textContent = 'Guardar producto'
      return
    }
    const ext = image.type === 'image/jpeg' ? 'jpg' : image.type.split('/')[1]
    const storagePath = `${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('product-images').upload(storagePath, image, { contentType: image.type, upsert: false })
    if (uploadError) {
      message(`No se pudo subir la fotografía: ${uploadError.message}`, 'is-error')
      button.disabled = false
      button.textContent = 'Guardar producto'
      return
    }
    imageUrl = supabase.storage.from('product-images').getPublicUrl(storagePath).data.publicUrl
  }
  const values = { nombre: String(data.get('nombre')).trim(), marca: String(data.get('marca') || '').trim(), categoria: String(data.get('categoria')).trim(), descripcion: String(data.get('descripcion') || '').trim(), precio: Number(data.get('precio')), stock: Number(data.get('stock')), imagen_url: imageUrl }
  if (role === 'admin') values.estado = data.get('estado') || 'activo'
  else if (original) values.estado = original.estado
  const result = id
    ? await supabase.from('products').update(values).eq('id', id)
    : await supabase.from('products').insert(values)
  if (result.error) message(`No se pudo guardar el producto: ${result.error.message}`, 'is-error')
  else { message(id ? 'Producto actualizado.' : 'Producto registrado.', 'is-success'); await loadProducts() }
  button.disabled = false
  button.textContent = 'Guardar producto'
}

async function toggleProduct(id) {
  const product = products.find(item => item.id === id)
  if (!product) return
  const nextState = product.estado === 'activo' ? 'inactivo' : 'activo'
  const { error } = await supabase.from('products').update({ estado: nextState }).eq('id', id)
  if (error) message(`No se pudo cambiar el estado: ${error.message}`, 'is-error')
  else { message(`Producto ${nextState === 'activo' ? 'activado' : 'desactivado'}.`, 'is-success'); await loadProducts() }
}

async function deleteProduct(id) {
  if (!window.confirm('¿Eliminar definitivamente este producto?')) return
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) message(`No se pudo eliminar: ${error.message}`, 'is-error')
  else { message('Producto eliminado.', 'is-success'); await loadProducts() }
}

async function loadOrders() {
  const content = root.querySelector('[data-admin-content]')
  content.innerHTML = '<p class="admin-loading">Cargando pedidos…</p>'
  const { data, error } = await supabase.from('orders').select('id,nombre_cliente,telefono_cliente,total,estado,fecha_creacion').order('fecha_creacion', { ascending: false })
  if (error) return message('No se pudieron consultar los pedidos.', 'is-error')
  content.innerHTML = `<div class="admin-section-head"><div><h2>Pedidos recibidos</h2><p>${data.length} pedidos registrados.</p></div><button type="button" class="admin-secondary" data-refresh-orders>Actualizar</button></div><div class="admin-card table-card"><div class="table-scroll"><table><thead><tr><th>Número</th><th>Cliente</th><th>Teléfono</th><th>Fecha</th><th>Total</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>${data.length ? data.map(order => `<tr><td class="order-number">${e(order.id)}</td><td>${e(order.nombre_cliente)}</td><td>${e(order.telefono_cliente)}</td><td>${new Date(order.fecha_creacion).toLocaleString('es-BO')}</td><td>${money(order.total)}</td><td>${role === 'admin' ? `<select data-order-state="${e(order.id)}">${states.map(state => `<option value="${state}" ${order.estado === state ? 'selected' : ''}>${state}</option>`).join('')}</select>` : `<span class="status-pill">${e(order.estado)}</span>`}</td><td><button class="table-action" type="button" data-order-detail="${e(order.id)}">Ver detalle</button></td></tr>`).join('') : '<tr><td colspan="7" class="admin-empty">Todavía no hay pedidos.</td></tr>'}</tbody></table></div></div><dialog class="detail-dialog" data-order-dialog><button class="dialog-close" type="button" data-close-order>×</button><h2>Detalle del pedido</h2><div data-order-detail-content></div></dialog>`
  content.querySelector('[data-refresh-orders]').addEventListener('click', loadOrders)
  content.querySelectorAll('[data-order-state]').forEach(select => select.addEventListener('change', () => updateOrderState(select)))
  content.querySelectorAll('[data-order-detail]').forEach(button => button.addEventListener('click', () => showOrderDetail(button.dataset.orderDetail)))
  content.querySelector('[data-close-order]').addEventListener('click', () => content.querySelector('[data-order-dialog]').close())
}

async function updateOrderState(select) {
  const { error } = await supabase.from('orders').update({ estado: select.value }).eq('id', select.dataset.orderState)
  if (error) { message(`No se pudo actualizar el pedido: ${error.message}`, 'is-error'); await loadOrders() }
  else message('Estado del pedido actualizado.', 'is-success')
}

async function showOrderDetail(id) {
  const dialog = root.querySelector('[data-order-dialog]')
  const target = dialog.querySelector('[data-order-detail-content]')
  target.innerHTML = '<p class="admin-loading">Cargando detalle…</p>'
  dialog.showModal()
  const { data, error } = await supabase.from('order_items').select('nombre_producto,precio_unitario,cantidad,subtotal').eq('order_id', id)
  if (error) target.innerHTML = '<p class="admin-alert">No se pudo cargar el detalle.</p>'
  else target.innerHTML = `<p class="order-detail-id">${e(id)}</p><ul>${data.map(item => `<li><span>${e(item.nombre_producto)} × ${Number(item.cantidad)}<small>${money(item.precio_unitario)} c/u</small></span><strong>${money(item.subtotal)}</strong></li>`).join('')}</ul>`
}

async function workerRequest(body) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
  const { data, error } = await supabase.functions.invoke('manage-workers', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) {
    let detail = error.message
    if (error.context instanceof Response) {
      const payload = await error.context.clone().json().catch(() => null)
      detail = payload?.error || payload?.message || error.context.statusText || detail
    } else if (error.cause?.message) detail = error.cause.message
    throw new Error(detail)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

async function loadWorkers({ preserveMessage = false } = {}) {
  const content = root.querySelector('[data-admin-content]')
  if (!preserveMessage) message('')
  content.innerHTML = '<p class="admin-loading">Cargando trabajadores…</p>'
  try {
    const { workers: list, orphanAccounts: missingProfiles } = await workerRequest({ action: 'list' })
    if (page !== 'team') return
    workers = list || []
    orphanAccounts = missingProfiles || []
    renderWorkers()
  } catch (error) {
    if (page !== 'team') return
    content.innerHTML = `<div class="admin-card worker-load-error"><h2>No se pudieron cargar los trabajadores</h2><p>${e(error.message)}</p><p>Comprueba que <code>manage-workers</code> esté desplegada y que la configuración CORS incluya el dominio de esta página.</p><button class="admin-secondary" type="button" data-worker-retry>Reintentar</button></div>`
    content.querySelector('[data-worker-retry]').addEventListener('click', () => loadWorkers())
  }
}

function renderWorkers() {
  const content = root.querySelector('[data-admin-content]')
  content.innerHTML = `<div class="admin-section-head"><div><h2>Trabajadores</h2><p>Personal con rol trabajador. La cuenta administradora está protegida.</p></div><button class="admin-primary" type="button" data-worker-add>+ Agregar trabajador</button></div><form class="admin-card worker-form" data-worker-form hidden><h3>Crear cuenta de trabajador</h3><div class="worker-form-grid"><label>Nombre completo<input name="nombre" required minlength="2" maxlength="120" autocomplete="name"/></label><label>Correo electrónico<input name="email" type="email" required maxlength="254" autocomplete="email"/></label><div class="worker-create-note"><span class="status-pill is-good">Rol trabajador · cuenta activa</span><small>Se generará una contraseña temporal aleatoria. Cópiala y entrégasela al trabajador; deberá cambiarla al iniciar sesión.</small></div></div><div class="form-actions"><button class="admin-secondary" type="button" data-worker-cancel>Cancelar</button><button class="admin-primary" type="submit">Crear cuenta de trabajador</button></div></form><div class="admin-card team-list"><div class="admin-list-head"><h3>Personal registrado</h3><span>${workers.length} ${workers.length === 1 ? 'trabajador' : 'trabajadores'}</span></div>${workers.length ? workers.map(worker => `<article class="worker-row"><div><strong>${e(worker.nombre || 'Sin nombre')}</strong><span>${e(worker.email)}</span><span class="worker-role">Rol: Trabajador</span>${worker.must_change_password ? '<span class="status-pill is-muted">Cambio de contraseña pendiente</span>' : ''}<span class="status-pill ${worker.activo ? 'is-good' : 'is-muted'}">${worker.activo ? 'Activo' : 'Desactivado'}</span></div><div class="worker-actions"><button type="button" data-worker-edit="${e(worker.id)}">Editar datos</button><button type="button" data-worker-reset="${e(worker.id)}" data-worker-email="${e(worker.email)}">Restablecer contraseña temporal</button><button type="button" class="${worker.activo ? 'danger-link' : 'activate-link'}" data-worker-toggle="${e(worker.id)}" data-active="${worker.activo}">${worker.activo ? 'Desactivar' : 'Reactivar'}</button></div></article>`).join('') : '<div class="admin-empty worker-empty"><p>No hay trabajadores registrados todavía.</p><button class="admin-primary" type="button" data-worker-empty-add>+ Agregar trabajador</button></div>'}</div><section class="admin-card orphan-list"><div class="admin-list-head"><h3>Cuentas Auth sin perfil</h3><span>${orphanAccounts.length} ${orphanAccounts.length === 1 ? 'cuenta' : 'cuentas'}</span></div>${orphanAccounts.length ? orphanAccounts.map(account => `<article class="worker-row"><div><strong>${e(account.nombre || 'Nombre pendiente')}</strong><span>${e(account.email || 'Sin correo en Auth')}</span><span class="orphan-id">UUID ${e(account.id)}</span></div><div class="worker-actions">${account.email ? `<button type="button" data-orphan-repair="${e(account.id)}" data-orphan-email="${e(account.email)}" data-orphan-name="${e(account.nombre)}">Completar perfil</button>` : '<span class="status-pill is-muted">Auth no tiene correo utilizable</span>'}</div></article>`).join('') : '<p class="admin-empty">No se encontraron cuentas Auth sin perfil.</p>'}</section><dialog class="detail-dialog worker-edit-dialog" data-worker-dialog><button class="dialog-close" type="button" data-worker-dialog-close aria-label="Cerrar">×</button><h2>Editar trabajador</h2><form data-worker-edit-form><input type="hidden" name="userId"/><label>Nombre completo<input name="nombre" required minlength="2" maxlength="120" autocomplete="name"/></label><label>Correo electrónico<input name="email" type="email" required maxlength="254" autocomplete="email"/></label><p>Rol: <strong>Trabajador</strong>. El nivel de acceso no se puede elevar desde este formulario.</p><div class="form-actions"><button class="admin-secondary" type="button" data-worker-edit-cancel>Cancelar</button><button class="admin-primary" type="submit">Guardar cambios</button></div></form></dialog><dialog class="detail-dialog worker-edit-dialog" data-orphan-dialog><button class="dialog-close" type="button" data-orphan-close aria-label="Cerrar">×</button><h2>Completar perfil de trabajador</h2><form data-orphan-form><input type="hidden" name="userId"/><label>Nombre completo<input name="nombre" required minlength="2" maxlength="120" autocomplete="name"/></label><label>Correo de la cuenta Auth<input name="email" readonly/></label><p>Se conservará el UUID y el correo existentes. El perfil tendrá rol trabajador y deberá cambiar la contraseña al ingresar.</p><div class="form-actions"><button class="admin-secondary" type="button" data-orphan-cancel>Cancelar</button><button class="admin-primary" type="submit">Crear perfil</button></div></form></dialog>`
  const form = content.querySelector('[data-worker-form]')
  content.querySelector('[data-worker-add]').addEventListener('click', () => { form.hidden = false; form.querySelector('[name="nombre"]').focus() })
  content.querySelector('[data-worker-cancel]').addEventListener('click', () => { form.reset(); form.hidden = true })
  content.querySelector('[data-worker-empty-add]')?.addEventListener('click', () => { form.hidden = false; form.querySelector('[name="nombre"]').focus() })
  form.addEventListener('submit', createWorker)
  content.querySelectorAll('[data-worker-toggle]').forEach(button => button.addEventListener('click', () => toggleWorker(button.dataset.workerToggle, button.dataset.active === 'true')))
  content.querySelectorAll('[data-worker-reset]').forEach(button => button.addEventListener('click', () => resetWorkerPassword(button.dataset.workerReset, button.dataset.workerEmail, button)))
  content.querySelectorAll('[data-orphan-repair]').forEach(button => button.addEventListener('click', () => openOrphanRepair(button.dataset.orphanRepair, button.dataset.orphanEmail, button.dataset.orphanName)))
  content.querySelectorAll('[data-worker-edit]').forEach(button => button.addEventListener('click', () => openWorkerEdit(button.dataset.workerEdit)))
  const dialog = content.querySelector('[data-worker-dialog]')
  content.querySelector('[data-worker-dialog-close]').addEventListener('click', () => dialog.close())
  content.querySelector('[data-worker-edit-cancel]').addEventListener('click', () => dialog.close())
  content.querySelector('[data-worker-edit-form]').addEventListener('submit', saveWorker)
  const orphanDialog = content.querySelector('[data-orphan-dialog]')
  content.querySelector('[data-orphan-close]').addEventListener('click', () => orphanDialog.close())
  content.querySelector('[data-orphan-cancel]').addEventListener('click', () => orphanDialog.close())
  content.querySelector('[data-orphan-form]').addEventListener('submit', repairOrphanProfile)
}

function openWorkerEdit(userId) {
  const worker = workers.find(item => item.id === userId)
  if (!worker) return
  const dialog = root.querySelector('[data-worker-dialog]')
  const form = dialog.querySelector('[data-worker-edit-form]')
  form.elements.userId.value = worker.id
  form.elements.nombre.value = worker.nombre || ''
  form.elements.email.value = worker.email || ''
  dialog.showModal()
}

function openOrphanRepair(userId, email, nombre) {
  const dialog = root.querySelector('[data-orphan-dialog]')
  const form = dialog.querySelector('[data-orphan-form]')
  form.reset()
  form.elements.userId.value = userId
  form.elements.email.value = email
  form.elements.nombre.value = nombre
  dialog.showModal()
}

async function repairOrphanProfile(event) {
  event.preventDefault()
  const form = event.currentTarget
  const button = form.querySelector('[type="submit"]')
  const values = new FormData(form)
  button.disabled = true
  button.textContent = 'Guardando perfil…'
  try {
    await workerRequest({ action: 'repair-profile', userId: values.get('userId'), nombre: values.get('nombre') })
    root.querySelector('[data-orphan-dialog]').close()
    await loadWorkers({ preserveMessage: true })
    message('Perfil reparado. El trabajador deberá cambiar su contraseña temporal al iniciar sesión.', 'is-success')
  } catch (error) {
    message(`No se pudo reparar el perfil: ${error.message}`, 'is-error')
  }
  button.disabled = false
  button.textContent = 'Crear perfil'
}

async function resetWorkerPassword(userId, email, button) {
  if (!window.confirm(`Se reemplazará la contraseña de ${email} por una temporal nueva y se exigirá cambiarla al iniciar sesión. ¿Continuar?`)) return
  button.disabled = true
  try {
    const result = await workerRequest({ action: 'reset-password', userId })
    showCreatedWorkerPassword(result.temporaryPassword, email, true)
  } catch (error) {
    message(`No se pudo restablecer la contraseña: ${error.message}`, 'is-error')
  } finally {
    button.disabled = false
  }
}

function showCreatedWorkerPassword(password, email, reset = false) {
  const dialog = document.createElement('dialog')
  dialog.className = 'detail-dialog worker-created-dialog'
  dialog.innerHTML = `<button class="dialog-close" type="button" data-created-close aria-label="Cerrar">×</button><p class="admin-eyebrow">${reset ? 'CONTRASEÑA RESTABLECIDA' : 'CUENTA CREADA'}</p><h2>${reset ? 'Entrega esta nueva contraseña' : 'Entrega esta contraseña temporal'}</h2><p>El trabajador iniciará sesión con este correo y deberá cambiar la contraseña antes de acceder al panel.</p><label>Correo electrónico<input data-created-email readonly/></label><label>Contraseña temporal<div class="created-password-field"><input data-created-password type="text" readonly autocomplete="off"/><button type="button" data-created-copy>Copiar</button></div></label><p class="created-copy-status" data-created-copy-status role="status"></p><div class="form-actions"><button class="admin-primary" type="button" data-created-done>Listo</button></div>`
  root.append(dialog)
  const passwordInput = dialog.querySelector('[data-created-password]')
  const copyStatus = dialog.querySelector('[data-created-copy-status]')
  dialog.querySelector('[data-created-email]').value = email
  passwordInput.value = password
  const close = () => dialog.close()
  dialog.querySelector('[data-created-close]').addEventListener('click', close)
  dialog.querySelector('[data-created-done]').addEventListener('click', close)
  dialog.querySelector('[data-created-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(passwordInput.value)
      copyStatus.textContent = 'Contraseña copiada.'
    } catch {
      passwordInput.select()
      const copied = document.execCommand('copy')
      copyStatus.textContent = copied ? 'Contraseña copiada.' : 'Selecciona y copia la contraseña manualmente.'
    }
  })
  dialog.addEventListener('close', () => {
    passwordInput.value = ''
    dialog.remove()
    void loadWorkers({ preserveMessage: true }).then(() => message(
      reset ? `Contraseña temporal restablecida para ${email}.` : `Cuenta creada para ${email}. Entrega la contraseña temporal al trabajador.`,
      'is-success',
    ))
  }, { once: true })
  dialog.showModal()
}

async function createWorker(event) {
  event.preventDefault()
  const form = event.currentTarget
  const button = form.querySelector('button[type="submit"]')
  const values = new FormData(form)
  button.disabled = true
  button.textContent = 'Creando cuenta…'
  try {
    const created = await workerRequest({ action: 'create', nombre: values.get('nombre'), email: values.get('email') })
    form.reset()
    form.hidden = true
    showCreatedWorkerPassword(created.temporaryPassword, values.get('email'))
  } catch (error) { message(`No se pudo crear la cuenta: ${error.message}`, 'is-error') }
  button.disabled = false
  button.textContent = 'Crear cuenta de trabajador'
}

async function saveWorker(event) {
  event.preventDefault()
  const form = event.currentTarget
  const button = form.querySelector('[type="submit"]')
  const values = new FormData(form)
  button.disabled = true
  try {
    await workerRequest({ action: 'update', userId: values.get('userId'), nombre: values.get('nombre'), email: values.get('email') })
    root.querySelector('[data-worker-dialog]').close()
    await loadWorkers({ preserveMessage: true })
    message('Datos del trabajador guardados. Si cambiaste el correo, el nuevo dato se reflejará al confirmar el cambio desde Auth.', 'is-success')
  } catch (error) { message(`No se pudieron guardar los cambios: ${error.message}`, 'is-error') }
  button.disabled = false
}

async function toggleWorker(userId, isActive) {
  const action = isActive ? 'deactivate' : 'reactivate'
  if (isActive && !window.confirm('¿Desactivar la cuenta de este trabajador?')) return
  try {
    await workerRequest({ action, userId })
    message(isActive ? 'Trabajador desactivado.' : 'Trabajador reactivado.', 'is-success')
    await loadWorkers()
  } catch (error) { message(`No se pudo cambiar el acceso: ${error.message}`, 'is-error') }
}

if (!supabase) loginView('La conexión con Supabase no está configurada.')
else {
  root.innerHTML = '<main class="login-page"><p class="admin-loading">Verificando sesión…</p></main>'
  supabase.auth.getSession().then(({ data, error }) => {
    if (error || !data.session) return loginView()
    verifyAndRender(data.session.user)
  })
}
