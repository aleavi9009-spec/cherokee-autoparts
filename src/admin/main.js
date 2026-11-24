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
let page = 'dashboard'
let products = []
let workers = []

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
  const { data: profile, error } = await supabase.from('profiles').select('rol,activo').eq('id', user.id).maybeSingle()
  if (error || !profile || !profile.activo || !['admin', 'trabajador'].includes(profile.rol)) {
    await supabase.auth.signOut()
    currentUser = null
    role = null
    return loginView('Esta cuenta no tiene permisos para acceder al panel.')
  }
  currentUser = user
  role = profile.rol
  shell()
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
  const { data, error } = await supabase.functions.invoke('manage-workers', { body })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}

async function loadWorkers() {
  const content = root.querySelector('[data-admin-content]')
  content.innerHTML = '<p class="admin-loading">Cargando trabajadores…</p>'
  try {
    const { workers: list } = await workerRequest({ action: 'list' })
    workers = list || []
    content.innerHTML = `<div class="admin-section-head"><div><h2>Trabajadores</h2><p>Invita personal y administra su acceso.</p></div></div><div class="team-layout"><form class="admin-card invite-form" data-invite-form><h3>Registrar trabajador</h3><label>Nombre completo<input name="nombre" required minlength="2" maxlength="120"/></label><label>Correo electrónico<input name="email" type="email" required/></label><button class="admin-primary" type="submit">Enviar invitación</button><p>La persona recibirá un enlace para crear su contraseña.</p></form><div class="admin-card team-list"><h3>Personal registrado</h3>${workers.length ? workers.map(worker => `<article class="worker-row"><div><strong>${e(worker.nombre || 'Sin nombre')}</strong><span>${e(worker.email)}</span><span class="status-pill ${worker.activo ? 'is-good' : 'is-muted'}">${worker.activo ? 'Activo' : 'Desactivado'}</span></div><button type="button" class="${worker.activo ? 'danger-link' : 'activate-link'}" data-worker-toggle="${e(worker.id)}" data-active="${worker.activo}">${worker.activo ? 'Desactivar' : 'Reactivar'}</button></article>`).join('') : '<p class="admin-empty">No hay trabajadores registrados.</p>'}</div></div>`
    content.querySelector('[data-invite-form]').addEventListener('submit', inviteWorker)
    content.querySelectorAll('[data-worker-toggle]').forEach(button => button.addEventListener('click', () => toggleWorker(button.dataset.workerToggle, button.dataset.active === 'true')))
  } catch (error) { message(`No se pudo cargar trabajadores: ${error.message}. Verifica que la función manage-workers esté desplegada.`, 'is-error') }
}

async function inviteWorker(event) {
  event.preventDefault()
  const form = event.currentTarget
  const button = form.querySelector('button[type="submit"]')
  const values = new FormData(form)
  button.disabled = true
  try {
    await workerRequest({ action: 'invite', nombre: values.get('nombre'), email: values.get('email') })
    message('Invitación enviada al correo del trabajador.', 'is-success')
    await loadWorkers()
  } catch (error) { message(`No se pudo enviar la invitación: ${error.message}`, 'is-error') }
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
