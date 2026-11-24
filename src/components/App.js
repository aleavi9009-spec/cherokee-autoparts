export function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

export function productCard(product) {
  const e = escapeHTML
  const available = Number(product.stock) > 0
  return `<article class="product-card">
    <div class="product-card__image-wrap">${product.imagen_url ? `<img class="product-card__image" src="${e(product.imagen_url)}" alt="${e(product.nombre)}" loading="lazy"/>` : '<div class="product-card__no-image">Fotografía no disponible</div>'}<span class="product-card__tag">${e(product.categoria || 'General')}</span></div>
    <div class="product-card__body"><p class="product-card__category">${e(product.marca || 'Sin marca')}</p><h3>${e(product.nombre)}</h3><p class="product-card__description">${e(product.descripcion || '')}</p>
      <div class="product-card__availability ${available ? '' : 'is-unavailable'}"><i></i>${available ? `Disponible · ${Number(product.stock)} en stock` : 'Agotado'}</div>
      <div class="product-card__footer"><strong>${money(product.precio)}</strong><button class="add-button" type="button" data-add="${e(product.id)}" ${available ? '' : 'disabled'} aria-label="Agregar ${e(product.nombre)} al carrito">Agregar <span>+</span></button></div>
    </div></article>`
}

export function money(value) {
  return `Bs ${Number(value || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function renderApp() {
  const base = import.meta.env.BASE_URL
  return `
    <header class="site-header"><div class="container header-inner">
      <a class="brand" href="#inicio" aria-label="Cherokee Auto Parts, inicio"><span class="brand__mark">C<span>.</span></span><span class="brand__name">CHEROKEE <small>AUTO PARTS</small></span></a>
      <button class="menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-label="Abrir menú"><span></span><span></span></button>
      <nav class="navigation" data-navigation aria-label="Navegación principal"><a href="#inicio">Inicio</a><a href="#catalogo">Catálogo</a><a href="#nosotros">Nosotros</a><a href="#contacto">Contacto</a></nav>
      <button class="header-cart" type="button" data-open-cart aria-label="Abrir carrito"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 1.9-1.4L21 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg><span class="cart-label">Carrito</span><b data-cart-count>0</b></button>
    </div></header>
    <main>
      <section class="hero" id="inicio"><div class="hero__image" role="img" aria-label="Vehículo todoterreno americano en una carretera de montaña"></div><div class="container hero__content">
        <p class="eyebrow"><span></span> REPUESTOS PARA VEHÍCULOS AMERICANOS</p><h1>Encuentra la pieza.<br/><em>Sigue tu camino.</em></h1><p class="hero__copy">Explora nuestro catálogo y encuentra repuestos para tu vehículo. Agrega lo que necesitas al carrito y envíanos tu pedido.</p><div class="hero__actions"><a class="button button--orange" href="#catalogo">Explorar catálogo <span>↗</span></a><a class="text-link" href="#contacto">Información de contacto <span>→</span></a></div>
      </div><div class="hero__caption">CHEROKEE AUTO PARTS</div><div class="hero__index">01 <span></span> 03</div></section>
      <section class="trust-strip" aria-label="Categorías de productos"><div class="container trust-strip__inner"><span>01 <b>Motor</b></span><span>02 <b>Frenos</b></span><span>03 <b>Iluminación</b></span><span>04 <b>Suspensión</b></span></div></section>
      <section class="section catalog" id="catalogo"><div class="container">
        <div class="section-heading"><div><p class="eyebrow eyebrow--dark"><span></span> CATÁLOGO</p><h2>La pieza que buscas,<br/><em>más cerca.</em></h2></div><p class="catalog-note">Consulta disponibilidad y agrega al carrito los productos que necesitas.</p></div>
        <div class="catalog-tools"><label class="search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg><input type="search" data-search placeholder="Buscar por nombre…" aria-label="Buscar productos por nombre"/></label><label class="filter-box"><span>Categoría</span><select data-category aria-label="Filtrar por categoría"><option value="all">Todas las categorías</option></select></label><span class="results-count" data-results-count></span></div>
        <p class="catalog-status" data-catalog-status role="status">Cargando productos…</p><div class="product-grid" data-product-grid></div><p class="empty-state" data-empty hidden>No encontramos productos con esos criterios.</p>
      </div></section>
      <section class="about" id="nosotros"><div class="about__photo" role="img" aria-label="Vehículo todoterreno americano en exteriores"></div><div class="about__content"><p class="eyebrow"><span></span> SOBRE CHEROKEE AUTO PARTS</p><h2>Repuestos para<br/>llegar <em>más lejos.</em></h2><p>Este espacio presenta el concepto de CHEROKEE AUTO PARTS. La información institucional se completará cuando esté disponible.</p><a class="button button--outline" href="#catalogo">Explorar productos <span>→</span></a></div></section>
      <section class="contact section" id="contacto"><div class="container contact__inner"><div><p class="eyebrow eyebrow--dark"><span></span> CONTACTO</p><h2>¿Encontraste<br/><em>lo que buscas?</em></h2></div><div class="contact__action"><p>Agrega tus productos al carrito y completa tus datos para enviar el pedido.</p><button class="button button--orange" type="button" data-open-cart>Ver mi carrito <span>→</span></button></div></div></section>
    </main>
    <footer class="site-footer"><div class="container footer-main"><a class="brand brand--footer" href="#inicio"><span class="brand__mark">C<span>.</span></span><span class="brand__name">CHEROKEE <small>AUTO PARTS</small></span></a><p>Repuestos para vehículos americanos.</p><div class="footer-links"><a href="#catalogo">Catálogo</a><a href="#nosotros">Nosotros</a><a href="#contacto">Contacto</a><a href="${base}admin.html">Acceso administrativo</a></div></div><div class="container footer-bottom"><span>© CHEROKEE AUTO PARTS</span><span>Catálogo en línea</span></div></footer>
    <dialog class="cart-dialog" data-cart-dialog aria-labelledby="cart-title"><div class="cart-dialog__header"><div><p class="eyebrow eyebrow--dark"><span></span> TU PEDIDO</p><h2 id="cart-title">Carrito</h2></div><button class="dialog-close" type="button" data-close-cart aria-label="Cerrar carrito">×</button></div>
      <div class="cart-items" data-cart-items></div><p class="cart-empty" data-cart-empty>Tu carrito está vacío. Explora el catálogo para agregar productos.</p><div class="cart-total"><span>Total</span><strong data-cart-total>Bs 0,00</strong></div>
      <div class="cart-error" data-cart-error role="alert" hidden></div><button class="button button--orange checkout-start" type="button" data-start-checkout>Finalizar pedido <span>→</span></button>
      <form class="checkout-form" data-checkout-form hidden><h3>Datos de contacto</h3><p>Usaremos estos datos para identificar tu pedido.</p><label>Nombre completo<input name="customerName" autocomplete="name" required minlength="2" maxlength="120"/></label><label>Número de teléfono<input name="phone" type="tel" autocomplete="tel" required minlength="5" maxlength="40"/></label><div class="checkout-actions"><button class="button button--outline-dark" type="button" data-back-cart>Volver al carrito</button><button class="button button--orange" type="submit" data-submit-order>Confirmar pedido</button></div></form>
      <section class="order-success" data-order-success hidden aria-live="polite"><p class="success-mark">✓</p><h3>¡Pedido registrado!</h3><p>Número de pedido: <strong data-order-id></strong></p><div data-order-summary></div><div class="order-qr" data-order-qr hidden><h4>QR para realizar el pago</h4><p>Escanéalo desde otro teléfono. El pedido se registró; esta página no procesa pagos.</p><img data-qr-image alt="Código QR de pago de CHEROKEE AUTO PARTS" hidden/><p class="qr-missing" data-qr-missing hidden>La imagen QR aún no está configurada. Contáctanos para coordinar el pago.</p></div><button class="button button--orange" type="button" data-close-cart>Listo</button></section>
    </dialog>
  `
}
