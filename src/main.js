import './styles/main.css'
import { renderApp, productCard, escapeHTML, money } from './components/App.js'
import qrImageAsset from '../imagenes/qr_code.jpg'
import { supabase } from './services/supabaseClient.js'
import { addCartItem, clearCart, getCartItems, removeCartItem, setCartItemQuantity, syncCartProducts } from './cart/cart.js'

document.querySelector('#app').innerHTML = renderApp()

const inviteDialog = document.querySelector('[data-invite-dialog]')
const inviteForm = document.querySelector('[data-invite-form]')
const inviteStatus = document.querySelector('[data-invite-status]')
const inviteError = document.querySelector('[data-invite-error]')
const inviteComplete = document.querySelector('[data-invite-complete]')
const inviteSignOutError = document.querySelector('[data-invite-sign-out-error]')
inviteDialog.querySelector('[data-invite-close]').addEventListener('click', () => inviteDialog.close())

const inviteUrl = new URL(window.location.href)
const inviteQuery = new URLSearchParams(inviteUrl.search)
const inviteHash = new URLSearchParams(inviteUrl.hash.slice(1))
const callbackType = inviteHash.get('type') || inviteQuery.get('type') || ''
const inviteMarkerPresent = inviteQuery.get('auth') === 'invite'
const tokenHash = inviteQuery.get('token_hash') || inviteHash.get('token_hash')
const callbackHasCredential = Boolean(
  tokenHash || inviteQuery.get('code') || inviteHash.get('access_token')
)
const tokenHashInvite = Boolean(tokenHash && (
  callbackType === 'invite' || (!callbackType && inviteMarkerPresent)
))
const inviteCallbackPresent = callbackType === 'invite'
  || (!callbackType && (inviteQuery.get('code') || inviteHash.get('access_token')))
  || tokenHashInvite
const inviteFlowRequested = inviteMarkerPresent || inviteCallbackPresent
let inviteValidationStarted = false
let inviteTokenVerificationPending = false
let verifiedInviteUserId = null

function openInviteDialog(status = 'Validando el enlace de invitación…') {
  if (!inviteDialog.open) inviteDialog.showModal()
  inviteStatus.textContent = status
  inviteStatus.hidden = false
  inviteForm.hidden = true
  inviteComplete.hidden = true
}

function showInviteLinkError(message) {
  if (!inviteDialog.open) inviteDialog.showModal()
  const callbackError = inviteQuery.get('error_description') || inviteQuery.get('error')
    || inviteHash.get('error_description') || inviteHash.get('error')
  inviteStatus.textContent = callbackError ? `${message} ${callbackError}` : message
  inviteStatus.hidden = false
  inviteForm.hidden = true
}

async function showInviteFormForWorker(user) {
  openInviteDialog('Verificando el perfil del trabajador…')
  const { data: profile, error } = await supabase.from('profiles')
    .select('rol,activo').eq('id', user.id).maybeSingle()
  if (error || !profile || profile.rol !== 'trabajador' || !profile.activo) {
    showInviteLinkError('Este enlace no corresponde a una invitación válida de un trabajador activo. Solicita una invitación nueva al administrador.')
    return
  }
  verifiedInviteUserId = user.id
  inviteStatus.hidden = true
  inviteError.hidden = true
  inviteForm.hidden = false
  inviteForm.elements.password.focus()
}

if (inviteMarkerPresent || inviteCallbackPresent) openInviteDialog()

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') {
      if (inviteFlowRequested && !session && !inviteTokenVerificationPending) {
        showInviteLinkError('No se pudo validar el enlace de invitación. Puede haber vencido o ya haberse usado.')
      } else if (inviteMarkerPresent && session && !inviteCallbackPresent) {
        showInviteLinkError('No se detectó un token de invitación válido. Abre el enlace completo enviado por correo.')
      }
      return
    }

    if (event !== 'SIGNED_IN' || !session) return
    if (!inviteCallbackPresent || (callbackType && callbackType !== 'invite')) {
      if (inviteMarkerPresent) showInviteLinkError('No se pudo confirmar que esta sesión provenga de una invitación válida.')
      return
    }
    if (inviteValidationStarted) return
    inviteValidationStarted = true
    void showInviteFormForWorker(session.user).catch(() => {
      showInviteLinkError('No se pudo comprobar el perfil del trabajador. Intenta abrir el enlace de nuevo.')
    })
  })

  if (tokenHashInvite) {
    inviteTokenVerificationPending = true
    openInviteDialog()
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' }).then(({ error }) => {
      inviteTokenVerificationPending = false
      if (error) showInviteLinkError(`No se pudo validar la invitación: ${error.message}`)
      else {
        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete('token_hash')
        cleanUrl.searchParams.delete('type')
        cleanUrl.hash = ''
        window.history.replaceState({}, document.title, cleanUrl)
      }
    }).catch(() => {
      inviteTokenVerificationPending = false
      showInviteLinkError('No se pudo conectar con Supabase para validar la invitación.')
    })
  } else if ((inviteMarkerPresent || inviteCallbackPresent) && (!callbackHasCredential || tokenHash)) {
    showInviteLinkError('El enlace no contiene un token de invitación. Solicita que te envíen una invitación nueva.')
  }
} else if (inviteMarkerPresent || inviteCallbackPresent) {
  showInviteLinkError('No se pudo validar el enlace. La conexión con Supabase no está configurada.')
}

inviteForm.querySelectorAll('[data-toggle-password]').forEach(button => {
  button.addEventListener('click', () => {
    const input = button.parentElement.querySelector('input')
    const show = input.type === 'password'
    input.type = show ? 'text' : 'password'
    button.textContent = show ? 'Ocultar' : 'Mostrar'
    button.setAttribute('aria-label', `${show ? 'Ocultar' : 'Mostrar'} ${input.name === 'password' ? 'nueva contraseña' : 'confirmación de contraseña'}`)
    button.setAttribute('aria-pressed', String(show))
  })
})

inviteForm.addEventListener('submit', async event => {
  event.preventDefault()
  if (!supabase) return
  const password = inviteForm.elements.password.value
  const confirmation = inviteForm.elements.passwordConfirm.value
  if (password !== confirmation) {
    inviteError.textContent = 'Las contraseñas no coinciden.'
    inviteError.hidden = false
    inviteForm.elements.passwordConfirm.focus()
    return
  }
  if (password.length < 12) {
    inviteError.textContent = 'La contraseña debe tener al menos 12 caracteres.'
    inviteError.hidden = false
    inviteForm.elements.password.focus()
    return
  }

  const submit = inviteForm.querySelector('[type="submit"]')
  submit.disabled = true
  submit.textContent = 'Guardando…'
  inviteError.hidden = true
  let error
  try {
    ({ error } = await supabase.auth.updateUser({ password }))
  } catch {
    inviteError.textContent = 'No se pudo conectar con Supabase. Comprueba tu conexión e inténtalo de nuevo.'
    inviteError.hidden = false
    submit.disabled = false
    submit.textContent = 'Establecer contraseña'
    return
  }
  if (error) {
    inviteError.textContent = `No se pudo guardar la contraseña: ${error.message}`
    inviteError.hidden = false
    submit.disabled = false
    submit.textContent = 'Establecer contraseña'
    return
  }

  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('rol,activo').eq('id', verifiedInviteUserId || '').maybeSingle()
  if (profileError || !profile || profile.rol !== 'trabajador' || !profile.activo) {
    await supabase.auth.signOut()
    inviteError.textContent = 'La contraseña se actualizó, pero el perfil ya no está activo como trabajador. Contacta al administrador para revisar tu acceso.'
    inviteError.hidden = false
    return
  }

  inviteForm.hidden = true
  inviteComplete.hidden = false
  const cleanUrl = new URL(window.location.href)
  cleanUrl.searchParams.delete('auth')
  cleanUrl.searchParams.delete('token_hash')
  cleanUrl.searchParams.delete('type')
  cleanUrl.searchParams.delete('code')
  cleanUrl.hash = ''
  window.history.replaceState({}, document.title, cleanUrl)
})

document.querySelector('[data-invite-sign-out]').addEventListener('click', async event => {
  const button = event.currentTarget
  button.disabled = true
  const { error } = await supabase.auth.signOut()
  if (error) {
    inviteSignOutError.textContent = `No se pudo cerrar la sesión: ${error.message}`
    inviteSignOutError.hidden = false
    button.disabled = false
    return
  }
  document.querySelector('[data-invite-complete] > p').textContent = 'Sesión cerrada. Puedes iniciar sesión con tu correo y la contraseña que acabas de establecer.'
})

const menuButton = document.querySelector('[data-menu-toggle]')
const navigation = document.querySelector('[data-navigation]')
menuButton?.addEventListener('click', () => {
  const expanded = menuButton.getAttribute('aria-expanded') === 'true'
  menuButton.setAttribute('aria-expanded', String(!expanded))
  navigation?.classList.toggle('is-open', !expanded)
})
navigation?.addEventListener('click', event => {
  if (event.target.closest('a')) {
    navigation.classList.remove('is-open')
    menuButton?.setAttribute('aria-expanded', 'false')
  }
})

const search = document.querySelector('[data-search]')
const category = document.querySelector('[data-category]')
const grid = document.querySelector('[data-product-grid]')
const empty = document.querySelector('[data-empty]')
const count = document.querySelector('[data-results-count]')
const catalogStatus = document.querySelector('[data-catalog-status]')
const cartDialog = document.querySelector('[data-cart-dialog]')
const cartItemsElement = document.querySelector('[data-cart-items]')
const cartEmpty = document.querySelector('[data-cart-empty]')
const cartTotal = document.querySelector('[data-cart-total]')
const cartCount = document.querySelector('[data-cart-count]')
const cartError = document.querySelector('[data-cart-error]')
const checkoutForm = document.querySelector('[data-checkout-form]')
const submitOrder = document.querySelector('[data-submit-order]')
const orderSuccess = document.querySelector('[data-order-success]')
const cartToast = document.querySelector('[data-cart-toast]')
let products = []
let catalogReady = false
let toastTimeout

function showCartToast(productName) {
  cartToast.textContent = `¡${productName} agregado al carrito!`
  cartToast.classList.remove('is-visible')
  clearTimeout(toastTimeout)
  requestAnimationFrame(() => cartToast.classList.add('is-visible'))
  toastTimeout = setTimeout(() => cartToast.classList.remove('is-visible'), 2600)
}

function priceInCents(price) {
  return Math.round(Number(price) * 100)
}

function currentProducts() {
  return new Map(products.map(product => [product.id, product]))
}

function renderProducts() {
  const query = search.value.trim().toLocaleLowerCase('es')
  const selectedCategory = category.value
  const filtered = products.filter(product => product.nombre.toLocaleLowerCase('es').includes(query)
    && (selectedCategory === 'all' || product.categoria === selectedCategory))
  grid.innerHTML = filtered.map(productCard).join('')
  const inCart = new Map(getCartItems().map(item => [item.id, item.quantity]))
  grid.querySelectorAll('[data-add]').forEach(button => {
    const product = products.find(item => item.id === button.dataset.add)
    const reachedStock = Number(inCart.get(product.id) || 0) >= Number(product.stock)
    button.disabled = reachedStock || Number(product.stock) < 1
    if (reachedStock) button.innerHTML = 'Stock en carrito <span>✓</span>'
  })
  count.textContent = `${filtered.length} ${filtered.length === 1 ? 'producto' : 'productos'}`
  empty.hidden = filtered.length > 0 || !catalogReady
  renderCart()
}

function renderCart() {
  const items = getCartItems()
  const productMap = currentProducts()
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  cartCount.textContent = String(itemCount)
  cartEmpty.hidden = items.length > 0
  cartItemsElement.innerHTML = items.map(item => {
    const p = item.product
    const liveProduct = productMap.get(item.id)
    const available = Boolean(liveProduct) && item.quantity <= Number(liveProduct.stock)
    const currentProduct = liveProduct || p
    const e = escapeHTML
    return `<article class="cart-item" data-cart-item="${e(item.id)}">
      ${p.imagen_url ? `<img src="${e(p.imagen_url)}" alt=""/>` : '<div class="cart-item__placeholder"></div>'}
      <div class="cart-item__info"><h3>${e(p.nombre)}</h3><span>${money(p.precio)} · ${available ? `Stock: ${Number(liveProduct.stock)}` : 'No disponible actualmente'}</span><div class="quantity-control"><button type="button" data-decrease="${e(item.id)}" aria-label="Reducir cantidad">−</button><span>${item.quantity}</span><button type="button" data-increase="${e(item.id)}" aria-label="Aumentar cantidad" ${!liveProduct || item.quantity >= Number(liveProduct.stock) ? 'disabled' : ''}>+</button><button type="button" class="remove-item" data-remove="${e(item.id)}">Eliminar</button></div></div>
      <strong class="cart-item__subtotal">${money(priceInCents(currentProduct.precio) * item.quantity / 100)}</strong>
      ${available ? '' : '<span class="cart-item__warning">Revisa disponibilidad</span>'}
    </article>`
  }).join('')
  const totalCents = items.reduce((sum, item) => sum + priceInCents(item.product.precio) * item.quantity, 0)
  cartTotal.textContent = money(totalCents / 100)
  const unavailable = items.some(item => {
    const product = productMap.get(item.id)
    return !product || item.quantity > Number(product.stock)
  })
  document.querySelector('[data-start-checkout]').disabled = items.length === 0 || !catalogReady || unavailable
}

function showCartError(message) {
  cartError.textContent = message
  cartError.hidden = !message
}

function openCart() {
  renderCart()
  cartDialog.showModal()
}

async function loadProducts() {
  if (!supabase) {
    catalogStatus.textContent = 'Catálogo no disponible: configura la conexión de Supabase en .env.local.'
    catalogStatus.classList.add('is-error')
    return
  }
  catalogStatus.textContent = 'Cargando productos…'
  catalogStatus.classList.remove('is-error')
  const { data, error } = await supabase.from('products')
    .select('id,nombre,marca,categoria,descripcion,precio,stock,imagen_url,estado')
    .eq('estado', 'activo')
    .order('nombre', { ascending: true })
  if (error) {
    catalogStatus.textContent = 'No se pudo cargar el catálogo. Comprueba la conexión e inténtalo de nuevo.'
    catalogStatus.classList.add('is-error')
    return
  }
  products = data || []
  catalogReady = true
  syncCartProducts(products)
  const previousCategory = category.value
  const categories = [...new Set(products.map(product => product.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  category.innerHTML = '<option value="all">Todas las categorías</option>' + categories.map(value => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join('')
  category.value = categories.includes(previousCategory) ? previousCategory : 'all'
  catalogStatus.textContent = products.length ? '' : 'Todavía no hay productos activos en el catálogo.'
  renderProducts()
}

search.addEventListener('input', renderProducts)
category.addEventListener('change', renderProducts)
document.addEventListener('click', async event => {
  if (event.target.closest('[data-open-cart]')) openCart()
  if (event.target.closest('[data-close-cart]')) cartDialog.close()
  const addButton = event.target.closest('[data-add]')
  if (addButton) {
    const product = currentProducts().get(addButton.dataset.add)
    if (product && addCartItem(product)) {
      renderProducts()
      showCartToast(product.nombre)
    } else {
      showCartError('No hay más unidades disponibles para este producto.')
      openCart()
    }
  }
  if (event.target.closest('[data-start-checkout]')) {
    showCartError('')
    checkoutForm.hidden = false
    checkoutForm.querySelector('input').focus()
  }
  if (event.target.closest('[data-back-cart]')) {
    checkoutForm.hidden = true
    showCartError('')
  }
  const removeButton = event.target.closest('[data-remove]')
  if (removeButton) {
    removeCartItem(removeButton.dataset.remove)
    showCartError('')
    renderProducts()
  }
  const quantityButton = event.target.closest('[data-increase], [data-decrease]')
  if (quantityButton) {
    const id = quantityButton.dataset.increase || quantityButton.dataset.decrease
    const item = getCartItems().find(entry => entry.id === id)
    const product = currentProducts().get(id)
    if (quantityButton.hasAttribute('data-increase')) addCartItem(product)
    else if (item && product && item.quantity > 1) setCartItemQuantity(id, item.quantity - 1, product)
    else if (item && item.quantity === 1) removeCartItem(id)
    showCartError('')
    renderProducts()
  }
})

checkoutForm.addEventListener('submit', async event => {
  event.preventDefault()
  if (!supabase || !catalogReady) {
    showCartError('No hay conexión disponible para registrar el pedido.')
    return
  }
  const items = getCartItems()
  if (!items.length) return
  const productMap = currentProducts()
  const invalidItem = items.find(item => {
    const product = productMap.get(item.id)
    return !product || item.quantity > Number(product.stock)
  })
  if (invalidItem) {
    showCartError(`No hay stock suficiente para ${invalidItem.product.nombre}. Actualiza la cantidad o elimínalo.`)
    return
  }
  const formData = new FormData(checkoutForm)
  const customerName = String(formData.get('customerName') || '').trim()
  const phone = String(formData.get('phone') || '').trim()
  submitOrder.disabled = true
  submitOrder.textContent = 'Registrando…'
  showCartError('')
  const { data, error } = await supabase.rpc('place_order', {
    p_nombre_cliente: customerName,
    p_telefono_cliente: phone,
    p_items: items.map(item => ({ product_id: item.id, quantity: item.quantity })),
  })
  submitOrder.disabled = false
  submitOrder.innerHTML = 'Confirmar pedido'
  if (error) {
    const detail = error.message?.toLowerCase().includes('stock') || error.message?.toLowerCase().includes('disponible')
      ? 'Cambió la disponibilidad de un producto. Revisa el carrito y vuelve a intentarlo.'
      : 'No se pudo registrar el pedido. Inténtalo de nuevo en unos momentos.'
    showCartError(detail)
    await loadProducts()
    renderCart()
    return
  }

  // La función SQL devuelve ID, precios, cantidades y total calculados en el servidor.
  const receipt = Array.isArray(data) ? data[0] : data
  clearCart()
  cartItemsElement.innerHTML = ''
  cartEmpty.hidden = true
  document.querySelector('.cart-total').hidden = true
  document.querySelector('.checkout-start').hidden = true
  checkoutForm.hidden = true
  orderSuccess.hidden = false
  document.querySelector('[data-order-id]').textContent = receipt?.order_id || 'Registrado'
  const orderTotal = Number(receipt?.total ?? items.reduce((sum, item) => sum + priceInCents(item.product.precio) * item.quantity, 0) / 100)
  document.querySelector('[data-order-summary]').innerHTML = `<ul>${(receipt?.items || []).map(item => `<li>${escapeHTML(item.nombre)} × ${Number(item.cantidad)} <span>${money(item.subtotal)}</span></li>`).join('')}</ul><p>Total: <strong>${money(orderTotal)}</strong></p>`
  document.querySelector('[data-qr-total]').textContent = money(orderTotal)
  const qrContainer = document.querySelector('[data-order-qr]')
  const qrImage = document.querySelector('[data-qr-image]')
  const qrMissing = document.querySelector('[data-qr-missing]')
  const qrSetting = (import.meta.env.VITE_PAYMENT_QR_IMAGE || '').trim()
  const qrSource = qrSetting
    ? (/^https?:\/\//i.test(qrSetting) ? qrSetting : `${import.meta.env.BASE_URL}${qrSetting.replace(/^\/+/, '')}`)
    : qrImageAsset
  qrContainer.hidden = false
  qrMissing.hidden = true
  qrImage.hidden = true
  qrImage.onload = () => { qrImage.hidden = false }
  qrImage.onerror = () => { qrImage.hidden = true; qrMissing.hidden = false }
  qrImage.src = qrSource
  renderCart()
  await loadProducts()
})

cartDialog.addEventListener('close', () => {
  checkoutForm.reset()
  checkoutForm.hidden = true
  orderSuccess.hidden = true
  document.querySelector('.cart-total').hidden = false
  document.querySelector('.checkout-start').hidden = false
  showCartError('')
})

loadProducts()
renderCart()
