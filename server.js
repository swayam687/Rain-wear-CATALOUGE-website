const multer = require('multer');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Upload storage ---------- */

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },   // 6 MB per image
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|jpg|png|webp|gif|heic|heif)/.test(file.mimetype);
    cb(ok ? null : new Error('Only image files allowed'), ok);
  }
});


/* =====================================================
   ADMIN AUTH MIDDLEWARE — must be defined BEFORE routes
===================================================== */

function requireAdmin(req, res, next) {
  if (req.cookies.admin === 'yes') return next();
  res.status(401).json({ error: 'Unauthorized' });
}


/* =====================================================
   PUBLIC API
===================================================== */

// Get all visible products
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE hidden = FALSE ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Track a batch of events
app.post('/api/track', async (req, res) => {
  try {
    const { visitorId, sessionId, events } = req.body;
    if (!visitorId || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    await pool.query(
      `INSERT INTO visitors (visitor_id, first_seen, last_seen)
       VALUES ($1, NOW(), NOW())
       ON CONFLICT (visitor_id) DO UPDATE SET last_seen = NOW()`,
      [visitorId]
    );

    for (const e of events) {
      await pool.query(
        `INSERT INTO events (visitor_id, session_id, event_type, event_data, page)
         VALUES ($1, $2, $3, $4, $5)`,
        [visitorId, sessionId || null, e.type,
         JSON.stringify(e.data || {}), e.page || null]
      );
    }

    res.json({ ok: true, received: events.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Tracking failed' });
  }
});


/* =====================================================
   ADMIN AUTH ROUTES
===================================================== */

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.cookie('admin', 'yes', { httpOnly: true, maxAge: 86400000 });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Wrong password' });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin');
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  res.json({ loggedIn: req.cookies.admin === 'yes' });
});


/* =====================================================
   ADMIN STATS
===================================================== */

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const daysInt = Math.min(parseInt(req.query.days) || 14, 90);

    const totals = await pool.query(`
      SELECT
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors) AS visitors,
        (SELECT COUNT(*) FROM events WHERE event_type = 'page_view') AS page_views,
        (SELECT COUNT(*) FROM events WHERE event_type = 'product_view') AS product_views,
        (SELECT COUNT(*) FROM events WHERE event_type = 'whatsapp_click') AS whatsapp_clicks,
(SELECT COUNT(*) FROM events
   WHERE event_type = 'scroll_depth'
     AND (event_data::jsonb->>'percent')::int = 100) AS scroll_complete,
        (SELECT COUNT(*) FROM events) AS total_events
    `);

    const daily = await pool.query(`
      SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM events
      WHERE created_at > NOW() - INTERVAL '${daysInt} days'
      GROUP BY DATE(created_at)
      ORDER BY day
    `);

    const topProducts = await pool.query(`
      SELECT event_data::jsonb->>'product' AS product,
             COUNT(*)::int AS views
      FROM events
      WHERE event_type = 'product_view'
        AND event_data IS NOT NULL
        AND event_data <> ''
      GROUP BY event_data::jsonb->>'product'
      ORDER BY views DESC
      LIMIT 10
    `);

    const topPages = await pool.query(`
      SELECT page, COUNT(*)::int AS views
      FROM events
      WHERE event_type = 'page_view' AND page IS NOT NULL
      GROUP BY page
      ORDER BY views DESC
      LIMIT 10
    `);

    res.json({
      totals: totals.rows[0],
      daily: daily.rows,
      topProducts: topProducts.rows,
      topPages: topPages.rows
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Stats error', detail: err.message });
  }
});

// Recent events table
app.get('/api/admin/events', requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const { rows } = await pool.query(
    `SELECT id, visitor_id, event_type, event_data, page, created_at
     FROM events ORDER BY id DESC LIMIT $1`,
    [limit]
  );
  res.json(rows);
});


/* =====================================================
   ADMIN PRODUCT MANAGEMENT
===================================================== */

// Upload an image, returns { url: '/uploads/xxx.jpg' }
app.post('/api/admin/upload', requireAdmin, (req, res) => {
  upload.single('image')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: '/uploads/' + req.file.filename });
  });
});

// Get all products (incl. hidden)
app.get('/api/admin/products', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY id');
  res.json(rows);
});

// CREATE a new product
app.post('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const { name, category, price, image, description,
            features, sizes, colors, tag, hidden } = req.body;

    if (!name || !category) {
      return res.status(400).json({ error: 'Name and category are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO products
        (name, category, price, image, description, features, sizes, colors, tag, hidden)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [name, category, price || '', image || '', description || '',
       features || '', sizes || '', colors || '', tag || null, !!hidden]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Create failed' });
  }
});

// UPDATE an existing product
app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    const { name, category, price, image, description,
            features, sizes, colors, tag, hidden } = req.body;

    const { rows } = await pool.query(
      `UPDATE products SET
        name=$1, category=$2, price=$3, image=$4, description=$5,
        features=$6, sizes=$7, colors=$8, tag=$9, hidden=$10
       WHERE id=$11
       RETURNING *`,
      [name, category, price, image, description,
       features, sizes, colors, tag, !!hidden, req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// Toggle hidden
app.patch('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const { hidden } = req.body;
  await pool.query('UPDATE products SET hidden = $1 WHERE id = $2',
    [hidden, req.params.id]);
  res.json({ ok: true });
});

// Delete
app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});


/* =====================================================
   START
===================================================== */

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`🔐 Admin dashboard at http://localhost:${PORT}/admin.html`);
});