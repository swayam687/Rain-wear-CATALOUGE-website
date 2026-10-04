/* ══════════════════════════════════════════════════
   ADMIN — Sunil Trading Co.
   IIFE + explicit window exposure so HTML onclick
   handlers can always reach the functions.
══════════════════════════════════════════════════ */

(function () {

  if (window.__adminLoaded) {
    console.warn('[admin] script already loaded — skipping');
    return;
  }
  window.__adminLoaded = true;


  /* ══════════════════════════════════════════════════
     AUTH
  ══════════════════════════════════════════════════ */

  async function checkAuth() {
    try {
      const res = await fetch('/api/admin/me');
      const { loggedIn } = await res.json();
      if (loggedIn) showDash();
    } catch (e) {
      console.warn('Auth check failed', e);
    }
  }

  async function login() {
    const pw = document.getElementById('pw').value;
    const err = document.getElementById('loginError');
    err.textContent = '';
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      });
      if (res.ok) showDash();
      else err.textContent = 'Wrong password. Try again.';
    } catch (e) {
      err.textContent = 'Network error. Try again.';
    }
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    location.reload();
  }

  function showDash() {
    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('dashView').classList.remove('hidden');
    greet();
    loadStats();
    loadEvents();
    setInterval(() => {
      loadStats();
      loadEvents();
    }, 15000);
  }

  function greet() {
    const h = new Date().getHours();
    const greeting = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
    document.getElementById('greeting').textContent = greeting;
    const opts = { weekday: 'long', month: 'long', day: 'numeric' };
    document.getElementById('todayDate').textContent =
      new Date().toLocaleDateString('en-IN', opts);
  }


  /* ══════════════════════════════════════════════════
     TABS & FILTERS
  ══════════════════════════════════════════════════ */

  let currentTab = 'analytics';
  let currentDays = 7;

  function switchTab(name) {
    currentTab = name;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.getElementById('tab-analytics').classList.toggle('hidden', name !== 'analytics');
    document.getElementById('tab-products').classList.toggle('hidden', name !== 'products');
    document.getElementById('topTitle').textContent =
      name === 'analytics' ? 'Analytics' : 'Products';
    if (name === 'products') loadProducts();
    else loadStats();
  }

  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDays = parseInt(btn.dataset.days, 10) || 7;
      document.getElementById('activitySub').textContent = `Last ${currentDays} days`;
      loadStats();
    });
  });


  /* ══════════════════════════════════════════════════
     STATS
  ══════════════════════════════════════════════════ */

  async function loadStats() {
    try {
      const res = await fetch(`/api/admin/stats?days=${currentDays}`);
      const data = await res.json();
      if (data.error) return console.error('Stats error', data);
      renderStatCards(data);
      renderActivityChart(data);
      renderTopProducts(data.topProducts || []);
      renderTopPages(data.topPages || []);
    } catch (e) {
      console.error('Failed to load stats', e);
    }
  }

  function sparkbars(values, color) {
    if (!values || !values.length) return '';
    const w = 60, h = 22, gap = 2;
    const max = Math.max(...values, 1);
    const count = values.length;
    const barW = Math.max(2, (w - (count - 1) * gap) / count);
    const bars = values.map((v, i) => {
      const bh = Math.max(2, (v / max) * h);
      const x = i * (barW + gap);
      return `<rect x="${x}" y="${h - bh}" width="${barW}" height="${bh}" rx="1.5" fill="${color}"/>`;
    }).join('');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${bars}</svg>`;
  }

  function statCard({ label, value, meta, color, sparkData, warn }) {
    return `
      <div class="stat-card">
        <div class="stat-head">
          <span class="stat-label">${label}</span>
          <span class="stat-icon">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
          </span>
        </div>
        <div class="stat-body">
          <span class="stat-num">${value}</span>
          ${sparkbars(sparkData, color)}
        </div>
        <p class="stat-meta ${warn ? 'warn' : ''}">${meta}</p>
      </div>
    `;
  }

  function renderStatCards(data) {
    const daily = data.daily || [];
    const spark = daily.slice(-7).map(d => d.count);
    const t = data.totals || {};
    const cards = [
      { label: 'Visitors',        value: t.visitors || 0,        meta: 'Unique visitors',    color: '#3B82F6', sparkData: spark },
      { label: 'Page views',      value: t.page_views || 0,      meta: 'Total pages viewed', color: '#8B5CF6', sparkData: spark },
      { label: 'Product views',   value: t.product_views || 0,   meta: 'Products opened',    color: '#10B981', sparkData: spark },
      { label: 'WhatsApp clicks', value: t.whatsapp_clicks || 0, meta: 'Buyer enquiries',    color: '#F59E0B', sparkData: spark }
    ];
    document.getElementById('statGrid').innerHTML = cards.map(statCard).join('');
  }

  function renderActivityChart(data) {
    const days = data.daily || [];
    const chartEl = document.getElementById('chart');
    const labelsEl = document.getElementById('chartLabels');
    const filled = [];
    for (let i = currentDays - 1; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const key = dt.getFullYear() + '-' +
                  String(dt.getMonth() + 1).padStart(2, '0') + '-' +
                  String(dt.getDate()).padStart(2, '0');
      const found = days.find(d => d.day === key);
      filled.push({ day: key, label: dt.getDate(), count: found ? found.count : 0 });
    }
    const totalEvents = filled.reduce((sum, d) => sum + d.count, 0);
    if (totalEvents === 0) {
      chartEl.innerHTML = '<p class="empty-state">No activity in this period yet.</p>';
      labelsEl.innerHTML = '';
      return;
    }
    const max = Math.max(...filled.map(d => d.count), 1);
    chartEl.innerHTML = filled.map(d => {
      const h = Math.max(4, (d.count / max) * 140);
      return `<div class="chart-group" title="${d.day}: ${d.count} events">
        <div class="chart-bar blue" style="height:${h}px"></div>
      </div>`;
    }).join('');
    labelsEl.innerHTML = filled.map(d => `<span>${d.label}</span>`).join('');
  }

  function renderTopProducts(list) {
    const el = document.getElementById('topProducts');
    if (!list || !list.length) {
      el.innerHTML = '<p class="empty-state">No product views yet.</p>';
      return;
    }
    const total = list.reduce((sum, p) => sum + p.views, 0);
    const colors = ['dot-blue', 'dot-green', 'dot-amber', 'dot-purple', 'dot-pink'];
    el.innerHTML = list.slice(0, 6).map((p, i) => {
      const pct = total ? ((p.views / total) * 100).toFixed(1) : '0.0';
      return `<div class="list-row">
        <span class="dot ${colors[i % colors.length]}"></span>
        <span class="name">${p.product || '(unknown)'}</span>
        <span class="num">${p.views}</span>
        <span class="pct">${pct}%</span>
      </div>`;
    }).join('');
  }

  function renderTopPages(list) {
    const el = document.getElementById('topPages');
    if (!list || !list.length) {
      el.innerHTML = '<p class="empty-state">No page views yet.</p>';
      return;
    }
    const total = list.reduce((sum, p) => sum + p.views, 0);
    const colors = ['dot-purple', 'dot-blue', 'dot-green', 'dot-amber', 'dot-pink'];
    el.innerHTML = list.slice(0, 6).map((p, i) => {
      const pct = total ? ((p.views / total) * 100).toFixed(1) : '0.0';
      return `<div class="list-row">
        <span class="dot ${colors[i % colors.length]}"></span>
        <span class="name">${p.page || '/'}</span>
        <span class="num">${p.views}</span>
        <span class="pct">${pct}%</span>
      </div>`;
    }).join('');
  }


  /* ══════════════════════════════════════════════════
     EVENTS
  ══════════════════════════════════════════════════ */

  async function loadEvents() {
    try {
      const res = await fetch('/api/admin/events?limit=30');
      const events = await res.json();
      const el = document.getElementById('eventsList');
      if (!events || !events.length) {
        el.innerHTML = '<p class="empty-state">No events yet.</p>';
        return;
      }
      el.innerHTML = events.map(e => {
        const time = new Date(e.created_at).toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit'
        });
        let d = {};
        try { d = JSON.parse(e.event_data || '{}'); } catch {}
        let detail = '';
        if (d.product)                    detail = d.product;
        else if (d.category)              detail = `Filter: ${d.category}`;
        else if (d.percent !== undefined) detail = `${d.percent}% of page`;
        else if (d.src)                   detail = 'Gallery opened';
        return `<div class="event-row">
          <span class="event-time">${time}</span>
          <div class="event-body">
            <span class="event-type ${e.event_type}">${e.event_type.replace(/_/g, ' ')}</span>
            ${detail ? `<span class="event-detail">${detail}</span>` : ''}
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      console.error('Failed to load events', e);
    }
  }


  /* ══════════════════════════════════════════════════
     PRODUCTS
  ══════════════════════════════════════════════════ */

  let currentProducts = [];

  async function loadProducts() {
    try {
      const res = await fetch('/api/admin/products');
      currentProducts = await res.json();
      renderProducts();
    } catch (e) {
      console.error('Failed to load products', e);
    }
  }

  const FALLBACK_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">' +
    '<rect width="80" height="80" fill="#1A1A1F"/>' +
    '<text x="40" y="46" font-family="Inter,sans-serif" font-size="11" fill="#5A5A63" text-anchor="middle">No photo</text>' +
    '</svg>'
  );

  function renderProducts() {
    const el = document.getElementById('productsList');
    if (!currentProducts.length) {
      el.innerHTML = '<p class="empty-state">No products yet. Tap + Add to create one.</p>';
      return;
    }
    el.innerHTML = currentProducts.map(p => `
      <div class="product-row">
        <div class="product-thumb">
          <img src="${p.image || FALLBACK_IMG}" alt=""
               onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
        </div>
        <div class="product-info">
          <h3>${p.name}</h3>
          <p>${p.category} · ${p.price || '—'}</p>
          <span class="badge ${p.hidden ? 'badge-hidden' : 'badge-visible'}">
            ${p.hidden ? 'Hidden' : 'Visible'}
          </span>
        </div>
        <div class="product-menu">
          <button onclick='openSheet(${JSON.stringify(p).replace(/'/g, "&#39;")})' aria-label="Edit">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>
            </svg>
          </button>
          <button onclick="toggleHidden(${p.id}, ${!p.hidden})" aria-label="Toggle visibility">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button class="danger" onclick="deleteProduct(${p.id})" aria-label="Delete">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  async function toggleHidden(id, hidden) {
    await fetch(`/api/admin/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden })
    });
    loadProducts();
  }

  async function deleteProduct(id) {
    if (!confirm('Delete this product permanently?')) return;
    await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
    loadProducts();
  }


  /* ══════════════════════════════════════════════════
     PRODUCT SHEET
  ══════════════════════════════════════════════════ */

  let currentCategory = 'raincoat';
  let currentImageUrl = '';

  function openSheet(product = null) {
    document.getElementById('sheetTitle').textContent = product ? 'Edit product' : 'Add product';
    document.getElementById('sheetError').textContent = '';
    document.getElementById('f_name').value        = product?.name || '';
    document.getElementById('f_price').value       = product?.price || '';
    document.getElementById('f_description').value = product?.description || '';
    document.getElementById('f_features').value    = product?.features || '';
    document.getElementById('f_sizes').value       = product?.sizes || '';
    document.getElementById('f_colors').value      = product?.colors || '';
    document.getElementById('f_tag').value         = product?.tag || '';
    document.getElementById('f_hidden').checked    = !!product?.hidden;
    document.getElementById('sheetTitle').dataset.id = product?.id || '';

    currentCategory = product?.category || 'raincoat';
    document.querySelectorAll('#f_category .seg').forEach(s => {
      s.classList.toggle('active', s.dataset.value === currentCategory);
    });

    currentImageUrl = product?.image || '';
    updatePhotoPreview();

    document.getElementById('productSheet').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeSheet() {
    document.getElementById('productSheet').classList.add('hidden');
    document.body.style.overflow = '';
  }

  function updatePhotoPreview() {
    const img = document.getElementById('photoPreview');
    const ph  = document.getElementById('photoPlaceholder');
    if (currentImageUrl) {
      img.src = currentImageUrl;
      img.classList.remove('hidden');
      ph.classList.add('hidden');
    } else {
      img.src = '';
      img.classList.add('hidden');
      ph.classList.remove('hidden');
      document.getElementById('photoLabel').textContent = 'Tap to add photo';
    }
  }

  async function saveProduct() {
    const id  = document.getElementById('sheetTitle').dataset.id;
    const err = document.getElementById('sheetError');
    err.textContent = '';

    const payload = {
      name:        document.getElementById('f_name').value.trim(),
      category:    currentCategory,
      price:       document.getElementById('f_price').value.trim(),
      image:       currentImageUrl,
      description: document.getElementById('f_description').value.trim(),
      features:    document.getElementById('f_features').value.trim(),
      sizes:       document.getElementById('f_sizes').value.trim(),
      colors:      document.getElementById('f_colors').value.trim(),
      tag:         document.getElementById('f_tag').value.trim() || null,
      hidden:      document.getElementById('f_hidden').checked
    };

    if (!payload.name) {
      err.textContent = 'Name is required';
      err.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const url    = id ? `/api/admin/products/${id}` : '/api/admin/products';
      const method = id ? 'PUT' : 'POST';
      console.log('Saving product:', method, url, payload);

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error || `Save failed (${res.status})`);
      }

      console.log('Save success:', body);
      closeSheet();
      loadProducts();

    } catch (e) {
      console.error('Save error:', e);
      err.textContent = e.message;
      err.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save product';
    }
  }


  /* ══════════════════════════════════════════════════
     EVENT LISTENERS
  ══════════════════════════════════════════════════ */

  const pwInput = document.getElementById('pw');
  if (pwInput) {
    pwInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') login();
    });
  }

  document.querySelectorAll('#f_category .seg').forEach(seg => {
    seg.addEventListener('click', () => {
      document.querySelectorAll('#f_category .seg').forEach(s => s.classList.remove('active'));
      seg.classList.add('active');
      currentCategory = seg.dataset.value;
    });
  });

  const photoInput = document.getElementById('photoInput');
  if (photoInput) {
    photoInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;

      const label = document.getElementById('photoLabel');
      const originalText = label.textContent;
      label.textContent = 'Uploading…';

      try {
        const fd = new FormData();
        fd.append('image', file);

        console.log('Uploading file:', file.name, file.type, file.size);

        const res  = await fetch('/api/admin/upload', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);

        currentImageUrl = data.url;
        updatePhotoPreview();
        console.log('Upload success:', currentImageUrl);

      } catch (err) {
        console.error('Upload error:', err);
        document.getElementById('sheetError').textContent = err.message;
        label.textContent = originalText;
      }
    });
  }


  /* ══════════════════════════════════════════════════
     EXPOSE TO WINDOW so HTML onclick handlers work
  ══════════════════════════════════════════════════ */

  window.checkAuth     = checkAuth;
  window.login         = login;
  window.logout        = logout;
  window.showDash      = showDash;
  window.greet         = greet;
  window.switchTab     = switchTab;
  window.loadStats     = loadStats;
  window.loadEvents    = loadEvents;
  window.loadProducts  = loadProducts;
  window.openSheet     = openSheet;
  window.closeSheet    = closeSheet;
  window.saveProduct   = saveProduct;
  window.toggleHidden  = toggleHidden;
  window.deleteProduct = deleteProduct;


  /* ══════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════ */

  checkAuth();

})();