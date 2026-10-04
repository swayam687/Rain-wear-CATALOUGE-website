/* =====================================================
   TRACKING SETUP
===================================================== */

function getVisitorId() {
  let id = localStorage.getItem('visitorId');
  if (!id) {
    id = 'v_' + Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem('visitorId', id);
  }
  return id;
}

function getSessionId() {
  let id = sessionStorage.getItem('sessionId');
  if (!id) {
    id = 's_' + Math.random().toString(36).slice(2) + Date.now();
    sessionStorage.setItem('sessionId', id);
  }
  return id;
}

const VISITOR_ID = getVisitorId();
const SESSION_ID = getSessionId();

let queue = [];
let flushTimer = null;

function track(type, data = {}) {
  queue.push({ type, data, page: window.location.hash || '/' });
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 1200);
}

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0);
  try {
    await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: VISITOR_ID, sessionId: SESSION_ID, events: batch })
    });
  } catch (err) {
    console.warn('Track failed', err);
    queue.unshift(...batch);
  }
}

window.addEventListener('beforeunload', () => {
  if (queue.length) {
    navigator.sendBeacon(
      '/api/track',
      new Blob(
        [JSON.stringify({ visitorId: VISITOR_ID, sessionId: SESSION_ID, events: queue })],
        { type: 'application/json' }
      )
    );
    queue = [];
  }
});

track('page_view', { page: '/' });


/* =====================================================
   NAVBAR
===================================================== */

const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  });
}

const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');
if (menuToggle && navMenu) {
  menuToggle.addEventListener('click', () => navMenu.classList.toggle('active'));
  document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => navMenu.classList.remove('active'));
  });
}


/* =====================================================
   PRODUCTS
===================================================== */

const productGrid = document.getElementById('productGrid');
let allProducts = [];

// Neutral inline SVG placeholder for products without a photo yet
const FALLBACK_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
  '<rect width="400" height="300" fill="#EEF2F5"/>' +
  '<text x="200" y="155" font-family="Inter,sans-serif" font-size="14" fill="#8894A3" text-anchor="middle">Photo coming soon</text>' +
  '</svg>'
);

async function loadProducts() {
  if (!productGrid) return;
  try {
    const res = await fetch('/api/products');
    allProducts = await res.json();
    renderProducts(allProducts);
  } catch (err) {
    productGrid.innerHTML = '<p class="grid-loading">Failed to load products.</p>';
  }
}

function renderProducts(products) {
  productGrid.innerHTML = '';
  if (products.length === 0) {
    productGrid.innerHTML = '<p class="grid-loading">No products found.</p>';
    return;
  }

  products.forEach(p => {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.dataset.category = p.category;

    card.innerHTML = `
      <div class="product-image">
        <img src="${p.image || FALLBACK_IMG}" alt="${p.name}"
             onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
        ${p.tag ? `<span class="product-tag">${p.tag}</span>` : ''}
      </div>
      <div class="product-content">
        <p class="product-category">${p.category.toUpperCase()}</p>
        <h3>${p.name}</h3>
        <p class="product-description">${p.description || ''}</p>
        <div class="product-bottom">
          <strong class="price">${p.price || ''}</strong>
          <button class="view-product"
            data-product="${p.name}"
            data-price="${p.price || ''}"
            data-image="${p.image || ''}"
            data-description="${p.description || ''}"
            data-features="${p.features || ''}"
            data-sizes="${p.sizes || ''}"
            data-colors="${p.colors || ''}">
            View Details
          </button>
        </div>
      </div>
    `;
    productGrid.appendChild(card);
  });

  attachProductHandlers();
  applyCategoryFilter(currentCategory);
}

loadProducts();


/* =====================================================
   CATEGORY FILTER
===================================================== */

let currentCategory = 'all';

document.querySelectorAll('.category-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.category;
    track('filter_use', { category: currentCategory });
    applyCategoryFilter(currentCategory);
  });
});

function applyCategoryFilter(cat) {
  document.querySelectorAll('.product-card').forEach(card => {
    card.style.display =
      (cat === 'all' || card.dataset.category === cat) ? 'block' : 'none';
  });
}


/* =====================================================
   PRODUCT MODAL + FULL-SIZE IMAGE VIEWER
===================================================== */

const productModal = document.getElementById('productModal');
const modalClose = document.getElementById('modalClose');
const modalTitle = document.getElementById('modalTitle');
const modalPrice = document.getElementById('modalPrice');
const modalImage = document.getElementById('modalImage');
const modalDescription = document.getElementById('modalDescription');
const modalFeatures = document.getElementById('modalFeatures');
const modalSizes = document.getElementById('modalSizes');
const modalColors = document.getElementById('modalColors');

const imageModal = document.getElementById('imageModal');
const largeImage = document.getElementById('largeImage');
const imageModalClose = document.getElementById('imageModalClose');

function attachProductHandlers() {
  document.querySelectorAll('.view-product').forEach(button => {
    button.addEventListener('click', () => {
      const p = {
        name: button.dataset.product,
        price: button.dataset.price,
        image: button.dataset.image,
        description: button.dataset.description,
        features: button.dataset.features,
        sizes: button.dataset.sizes,
        colors: button.dataset.colors
      };

      modalTitle.textContent = p.name;
      modalPrice.textContent = p.price;
      modalImage.src = p.image || FALLBACK_IMG;
      modalDescription.textContent = p.description;
      modalSizes.textContent = p.sizes;
      modalColors.textContent = p.colors;

      modalFeatures.innerHTML = '';
      (p.features || '').split(',').filter(Boolean).forEach(f => {
        const span = document.createElement('span');
        span.textContent = f.trim();
        modalFeatures.appendChild(span);
      });

      productModal.classList.add('active');
      document.body.style.overflow = 'hidden';

      track('product_view', { product: p.name, price: p.price });
    });
  });
}

// Make the modal image open the full-size viewer
if (modalImage) {
  modalImage.addEventListener('click', () => {
    if (!modalImage.src) return;
    if (largeImage && imageModal) {
      largeImage.src = modalImage.src;
      imageModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  });
}

if (modalClose) modalClose.addEventListener('click', closeProductModal);
const modalOverlay = document.querySelector('.modal-overlay');
if (modalOverlay) modalOverlay.addEventListener('click', closeProductModal);

function closeProductModal() {
  if (!productModal) return;
  productModal.classList.remove('active');
  if (!imageModal || !imageModal.classList.contains('active')) {
    document.body.style.overflow = '';
  }
}

// Full-size viewer
if (imageModalClose) imageModalClose.addEventListener('click', closeImageModal);
if (imageModal) {
  imageModal.addEventListener('click', e => {
    if (e.target === imageModal) closeImageModal();
  });
}

function closeImageModal() {
  if (!imageModal) return;
  imageModal.classList.remove('active');
  if (!productModal || !productModal.classList.contains('active')) {
    document.body.style.overflow = '';
  }
}


/* =====================================================
   GALLERY
===================================================== */

document.querySelectorAll('.gallery-item').forEach(item => {
  item.addEventListener('click', () => {
    const img = item.querySelector('img');
    if (!img || !largeImage || !imageModal) return;
    largeImage.src = img.src;
    imageModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    track('gallery_view', { src: largeImage.src });
  });
});


/* =====================================================
   ESC KEY
===================================================== */

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeImageModal();
    closeProductModal();
  }
});


/* =====================================================
   WHATSAPP TRACKING
===================================================== */

document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
  link.addEventListener('click', () => {
    const isModalOpen = productModal && productModal.classList.contains('active');
    const product = isModalOpen && modalTitle ? modalTitle.textContent : 'general';
    queue.push({
      type: 'whatsapp_click',
      data: { product },
      page: window.location.hash || '/'
    });
    flush();
  });
});


/* =====================================================
   SCROLL DEPTH TRACKING
===================================================== */

const scrollMilestones = [25, 50, 75, 100];
const reachedMilestones = new Set();

window.addEventListener('scroll', () => {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  if (docHeight <= 0) return;
  const percent = Math.round((scrollTop / docHeight) * 100);
  scrollMilestones.forEach(milestone => {
    if (percent >= milestone && !reachedMilestones.has(milestone)) {
      reachedMilestones.add(milestone);
      track('scroll_depth', { percent: milestone });
    }
  });
}, { passive: true });


/* =====================================================
   FOOTER YEAR
===================================================== */

const footerYear = document.querySelector('.footer-bottom p');
if (footerYear) {
  footerYear.textContent = `© ${new Date().getFullYear()} Sunil Trading Company. All Rights Reserved.`;
}


/* =====================================================
   SMOOTH SCROLL
===================================================== */

document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const href = link.getAttribute('href');
    if (href === '#' || href.length < 2) return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    const headerOffset = window.innerWidth >= 1000 ? 88 : 76;
    const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top, behavior: 'smooth' });
    const navMenuEl = document.getElementById('navMenu');
    if (navMenuEl) navMenuEl.classList.remove('active');
  });
});


/* =====================================================
   SCROLL REVEAL
===================================================== */

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.section, .hero-clients, .proof-bar, .closing').forEach(el => {
  el.classList.add('reveal');
  revealObserver.observe(el);
});

/* Case study photo → full-size viewer */
document.querySelectorAll('.case-img img').forEach(img => {
  img.style.cursor = 'zoom-in';
  img.addEventListener('click', () => {
    const largeImage = document.getElementById('largeImage');
    const imageModal = document.getElementById('imageModal');
    if (!largeImage || !imageModal) return;
    largeImage.src = img.src;
    imageModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  });
});