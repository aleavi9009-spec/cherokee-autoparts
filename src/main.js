import './styles/main.css'
import { renderApp, productCard, escapeHTML, money } from './components/App.js'
import qrImageAsset from '../imagenes/qr_code.jpg'
import { supabase } from './services/supabaseClient.js'
import { addCartItem, clearCart, getCartItems, removeCartItem, setCartItemQuantity, syncCartProducts } from './cart/cart.js'

document.querySelector('#app').innerHTML = renderApp()

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
let products = []
let catalogReady = false

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
      <strong class="cart-item__subtotal">${money(Number(currentProduct.precio) * item.quantity)}</strong>
      ${available ? '' : '<span class="cart-item__warning">Revisa disponibilidad</span>'}
    </article>`
  }).join('')
  cartTotal.textContent = money(items.reduce((sum, item) => sum + Number(item.product.precio) * item.quantity, 0))
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
  document.querySelector('[data-order-summary]').innerHTML = `<ul>${(receipt?.items || []).map(item => `<li>${escapeHTML(item.nombre)} × ${Number(item.cantidad)} <span>${money(item.subtotal)}</span></li>`).join('')}</ul><p>Total: <strong>${money(receipt?.total)}</strong></p>`
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
