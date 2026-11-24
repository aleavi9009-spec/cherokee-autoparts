const STORAGE_KEY = 'cherokee-auto-parts-cart-v1'

function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter(item => item && typeof item.id === 'string' && Number.isInteger(item.quantity) && item.quantity > 0 && item.product)
  } catch {
    return []
  }
}

let items = readCart()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // El carrito sigue funcionando en memoria si el navegador bloquea localStorage.
  }
}

export function getCartItems() {
  return items.map(item => ({ ...item, product: { ...item.product } }))
}

export function addCartItem(product) {
  const item = items.find(entry => entry.id === product.id)
  const quantity = (item?.quantity || 0) + 1
  if (quantity > Number(product.stock)) return false
  if (item) {
    item.quantity = quantity
    item.product = { ...product }
  } else {
    items.push({ id: product.id, quantity: 1, product: { ...product } })
  }
  persist()
  return true
}

export function setCartItemQuantity(id, quantity, product) {
  const item = items.find(entry => entry.id === id)
  if (!item || !Number.isInteger(quantity) || quantity < 1) return false
  if (!product || quantity > Number(product.stock)) return false
  item.quantity = quantity
  item.product = { ...product }
  persist()
  return true
}

export function removeCartItem(id) {
  items = items.filter(item => item.id !== id)
  persist()
}

export function syncCartProducts(products) {
  const productMap = new Map(products.map(product => [product.id, product]))
  items = items.map(item => productMap.has(item.id)
    ? { ...item, product: { ...productMap.get(item.id) } }
    : item)
  persist()
}

export function clearCart() {
  items = []
  persist()
}
