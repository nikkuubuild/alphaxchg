const express = require('express');
const { createClient } = require('@libsql/client');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'alphaxchg-admin-secret-change-in-production';

// ─── Database (Turso / local libsql) ───
const db = createClient({
  url: process.env.TURSO_URL || 'file:data.db',
  authToken: process.env.TURSO_AUTH_TOKEN || undefined
});

// ─── Middleware ───
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// ─── Upload (memory storage for Vercel compatibility) ───
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Helpers ───
function getMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  return { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'application/octet-stream';
}

async function getOne(sql, args) {
  const r = await db.execute({ sql, args: args || [] });
  return r.rows[0] || null;
}

async function getAll(sql, args) {
  const r = await db.execute({ sql, args: args || [] });
  return r.rows;
}

async function run(sql, args) {
  return await db.execute({ sql, args: args || [] });
}

async function upsertSetting(key, value) {
  await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

// ─── Serve uploaded files from DB ───
app.get('/uploads/:filename', async (req, res) => {
  try {
    const row = await getOne('SELECT data, content_type FROM file_uploads WHERE filename = ?', [req.params.filename]);
    if (row) {
      res.set('Content-Type', row.content_type);
      res.set('Cache-Control', 'public, max-age=31536000');
      return res.send(Buffer.from(row.data));
    }
    // Fallback: filesystem (local dev)
    const fpath = path.join(__dirname, 'uploads', req.params.filename);
    if (fs.existsSync(fpath)) return res.sendFile(fpath);
    const ipath = path.join(__dirname, 'image', req.params.filename);
    if (fs.existsSync(ipath)) return res.sendFile(ipath);
    res.status(404).send('Not found');
  } catch (e) {
    console.error('File serve error:', e);
    res.status(500).send('Error');
  }
});

// ─── DB Init (runs once per cold start) ───
let initDone = false;

async function ensureInit() {
  if (initDone) return;

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS marquee_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      color TEXT DEFAULT '#ffffff',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS slider_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS slider_marquee (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position TEXT NOT NULL UNIQUE,
      items TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS whatsapp_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL,
      icon TEXT DEFAULT '',
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      badge TEXT DEFAULT '',
      icon_bg TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'text',
      filename TEXT,
      text_value TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS footer_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      icon TEXT NOT NULL,
      icon_bg TEXT DEFAULT '',
      label TEXT NOT NULL,
      sub TEXT DEFAULT '',
      url TEXT NOT NULL,
      is_emergency INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS file_uploads (
      filename TEXT PRIMARY KEY,
      data BLOB NOT NULL,
      content_type TEXT DEFAULT 'image/png',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Only seed once
  const seeded = await getOne("SELECT value FROM settings WHERE key = 'seeded'");
  if (!seeded) {
    // Admin password
    const hash = bcrypt.hashSync('admin123', 10);
    await upsertSetting('admin_password', hash);

    // Marquee items
    const marqueeItems = [
      'Trusted by 10,000+ traders worldwide',
      'ID delivery in under 5 minutes',
      '100% secure · military-grade encryption',
      '24/7 premium customer support',
      'Fastest KYC verification in the market'
    ];
    for (let i = 0; i < marqueeItems.length; i++) {
      await run('INSERT INTO marquee_items (text, sort_order) VALUES (?, ?)', [marqueeItems[i], i]);
    }

    // Slider marquee positions
    const positions = {
      top: ['Ultra-low latency execution', 'Real-time market data', 'Bank-grade security', 'White-glove onboarding'],
      bottom: ['500+ tradable instruments', 'Instant fiat withdrawals', 'Deep liquidity pools', 'Copy trading enabled'],
      left: ['ONE-CLICK TRADE', 'ZERO FEES', 'INSTANT SETUP', 'VIP PERKS'],
      right: ['DEEP LIQUIDITY', 'PRO DASHBOARD', 'RISK MANAGER', 'FAST MATCHING']
    };
    for (const [pos, items] of Object.entries(positions)) {
      await run('INSERT INTO slider_marquee (position, items) VALUES (?, ?)', [pos, JSON.stringify(items)]);
    }

    // WhatsApp numbers
    const waSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`; // Placeholder for actual SVG
    const nums = [
      ['8651381149', waSvg, 'GET ID 1', 'Primary support line', 'HOT', 0],
      ['7542943418', waSvg, 'GET ID 2', 'Fast track - 2min delivery', 'FAST', 1],
      ['8235817872', waSvg, 'GET ID 3', 'Additional agents online', 'READY', 2],
      ['9472194303', waSvg, 'HELP & SUPPORT', 'General enquiries', '24/7', 3]
    ];
    for (const n of nums) {
      await run('INSERT INTO whatsapp_numbers (number, icon, title, description, badge, sort_order) VALUES (?, ?, ?, ?, ?, ?)', n);
    }

    // Footer links
    await run('INSERT INTO footer_links (icon, icon_bg, label, sub, url, is_emergency, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['✈️', 'linear-gradient(135deg,rgba(0,136,204,0.12),rgba(0,136,204,0.04))', 'Telegram Channel', '@AlphaXchng_Official', 'https://t.me/AlphaXchng_Official', 0, 0]);
    await run('INSERT INTO footer_links (icon, icon_bg, label, sub, url, is_emergency, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['📸', 'linear-gradient(135deg,rgba(225,48,108,0.12),rgba(225,48,108,0.04))', 'Instagram', '@alphaxchng', 'https://instagram.com/alphaxchng', 0, 1]);
    await run('INSERT INTO footer_links (icon, icon_bg, label, sub, url, is_emergency, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['💬', 'linear-gradient(135deg,rgba(139,195,74,0.12),rgba(139,195,74,0.04))', 'Emergency Support', 'Tap to chat on WhatsApp', 'https://wa.me/919999999999', 1, 2]);

    // Services
    const svcIcons = {
      available: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      bonus: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 15 2 2 4-4"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v4"/></svg>`,
      deposit: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m17 19-5 3-5-3"/></svg>`,
      unlimited: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
      safe: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
      instant: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 2-2 10h3L11 22"/></svg>`
    };
    const services = [
      ['24x7 Available', 'Round-the-clock support for all your needs', svcIcons.available, 0],
      ['7% Bonus on Every New Deposits', 'Get instant bonus on your first deposit', svcIcons.bonus, 1],
      ['Minimum Deposit Amount ₹100', 'Start trading with just ₹100', svcIcons.deposit, 2],
      ['Maximum Deposit Unlimited', '100% safe funds with no deposit limits', svcIcons.unlimited, 3],
      ['100% Safe Funds', 'Military-grade encryption for all transactions', svcIcons.safe, 4],
      ['Instant Withdrawals', 'Quick and hassle-free withdrawal process', svcIcons.instant, 5]
    ];
    for (const s of services) {
      await run('INSERT INTO services (title, description, icon, sort_order) VALUES (?, ?, ?, ?)', s);
    }

    // Seed images from image/ folder into file_uploads + slider_images + payment_methods
    const imageDir = path.join(__dirname, 'image');
    if (fs.existsSync(imageDir)) {
      const allFiles = fs.readdirSync(imageDir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));

      // Store all image files in file_uploads
      for (const f of allFiles) {
        const data = fs.readFileSync(path.join(imageDir, f));
        await run('INSERT OR IGNORE INTO file_uploads (filename, data, content_type) VALUES (?, ?, ?)', [f, data, getMime(f)]);
      }

      // Slider images (all images)
      for (let i = 0; i < allFiles.length; i++) {
        await run('INSERT INTO slider_images (filename, original_name, sort_order) VALUES (?, ?, ?)', [allFiles[i], allFiles[i], i]);
      }

      // Payment method images
      const payImages = allFiles.filter(f => !f.startsWith('sliderimg'));
      let payIdx = 0;
      for (const f of payImages) {
        await run('INSERT INTO payment_methods (type, filename, sort_order) VALUES (?, ?, ?)', ['image', f, payIdx++]);
      }
      // Payment text items
      for (const t of ['USDT', 'BTC', 'ETH']) {
        await run('INSERT INTO payment_methods (type, text_value, sort_order) VALUES (?, ?, ?)', ['text', t, payIdx++]);
      }
    }

    await upsertSetting('seeded', 'true');
  }

  // Ensure admin password exists (for fresh DBs where seeding might have had issues)
  const pw = await getOne("SELECT value FROM settings WHERE key = 'admin_password'");
  if (!pw) {
    await upsertSetting('admin_password', bcrypt.hashSync('admin123', 10));
  }

  initDone = true;
}

// Init middleware
app.use(async (req, res, next) => {
  try { await ensureInit(); next(); }
  catch (e) { console.error('Init error:', e); res.status(500).json({ error: 'Server initialization failed: ' + e.message }); }
});

// ─── Auth Middleware ───
function authMiddleware(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════

app.post('/api/login', async (req, res) => {
  try {
    const { password } = req.body;
    const stored = await getOne("SELECT value FROM settings WHERE key = 'admin_password'");
    if (!stored || !bcrypt.compareSync(password, stored.value)) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/change-password', authMiddleware, async (req, res) => {
  try {
    const { current, newPassword } = req.body;
    const stored = await getOne("SELECT value FROM settings WHERE key = 'admin_password'");
    if (!stored || !bcrypt.compareSync(current, stored.value)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (newPassword.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    await upsertSetting('admin_password', bcrypt.hashSync(newPassword, 10));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/check-auth', authMiddleware, (req, res) => res.json({ authenticated: true }));

// ═══════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════

app.get('/api/public/all', async (req, res) => {
  try {
    const data = {};

    data.marquee = await getAll('SELECT text, color FROM marquee_items ORDER BY sort_order');

    const sliderImages = await getAll('SELECT filename FROM slider_images ORDER BY sort_order');
    data.sliderImages = sliderImages.map(r => '/uploads/' + r.filename);

    const sm = await getAll('SELECT position, items FROM slider_marquee');
    data.sliderMarquee = {};
    sm.forEach(r => { data.sliderMarquee[r.position] = JSON.parse(r.items); });

    data.numbers = await getAll('SELECT number, icon, title, description, badge, icon_bg FROM whatsapp_numbers ORDER BY sort_order');

    const paymentMethods = await getAll('SELECT type, filename, text_value FROM payment_methods ORDER BY sort_order');
    data.paymentMethods = paymentMethods.map(r => ({
      img: r.type === 'image' ? '/uploads/' + r.filename : null,
      text: r.type === 'text' ? r.text_value : null
    }));

    data.footerLinks = await getAll('SELECT icon, icon_bg, label, sub, url, is_emergency FROM footer_links ORDER BY sort_order');

    data.services = await getAll('SELECT id, title, description, icon FROM services ORDER BY sort_order');

    const footerTheme = await getOne("SELECT value FROM settings WHERE key = 'footer_theme'");
    data.footerTheme = footerTheme ? footerTheme.value : 'neon-green';

    const marqueeSpeed = await getOne("SELECT value FROM settings WHERE key = 'marquee_speed'");
    const sliderSpeed = await getOne("SELECT value FROM settings WHERE key = 'slider_speed'");
    const verticalSpeed = await getOne("SELECT value FROM settings WHERE key = 'vertical_speed'");
    data.marqueeSpeed = marqueeSpeed ? parseInt(marqueeSpeed.value) : 30;
    data.sliderSpeed = sliderSpeed ? parseInt(sliderSpeed.value) : 20;
    data.verticalSpeed = verticalSpeed ? parseInt(verticalSpeed.value) : 18;

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN CRUD — MARQUEE ITEMS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/marquee-items', authMiddleware, async (req, res) => {
  try { res.json(await getAll('SELECT * FROM marquee_items ORDER BY sort_order')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/marquee-items', authMiddleware, async (req, res) => {
  try {
    const { text, color } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });
    const maxSort = await getOne('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM marquee_items');
    const result = await run('INSERT INTO marquee_items (text, color, sort_order) VALUES (?, ?, ?)', [text, color || '#ffffff', maxSort.next]);
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/marquee-items/reorder', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    await db.batch(ids.map((id, i) => ({ sql: 'UPDATE marquee_items SET sort_order = ? WHERE id = ?', args: [i, id] })), 'write');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/marquee-items/:id', authMiddleware, async (req, res) => {
  try {
    const { text, color } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });
    await run('UPDATE marquee_items SET text = ?, color = ? WHERE id = ?', [text, color || '#ffffff', req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/marquee-items/:id', authMiddleware, async (req, res) => {
  try { await run('DELETE FROM marquee_items WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN CRUD — SLIDER IMAGES
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/slider-images', authMiddleware, async (req, res) => {
  try { res.json(await getAll('SELECT * FROM slider_images ORDER BY sort_order')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/slider-images', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image file required' });
    const ext = path.extname(req.file.originalname);
    const filename = uuidv4() + ext;
    // Store file in DB
    await run('INSERT INTO file_uploads (filename, data, content_type) VALUES (?, ?, ?)', [filename, req.file.buffer, req.file.mimetype]);
    const maxSort = await getOne('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM slider_images');
    const result = await run('INSERT INTO slider_images (filename, original_name, sort_order) VALUES (?, ?, ?)', [filename, req.file.originalname, maxSort.next]);
    res.json({ id: Number(result.lastInsertRowid), url: '/uploads/' + filename });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/slider-images/reorder', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    await db.batch(ids.map((id, i) => ({ sql: 'UPDATE slider_images SET sort_order = ? WHERE id = ?', args: [i, id] })), 'write');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/slider-images/:id', authMiddleware, async (req, res) => {
  try {
    const img = await getOne('SELECT filename FROM slider_images WHERE id = ?', [req.params.id]);
    if (img) {
      await run('DELETE FROM file_uploads WHERE filename = ?', [img.filename]);
      await run('DELETE FROM slider_images WHERE id = ?', [req.params.id]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN CRUD — SLIDER MARQUEE
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/slider-marquee', authMiddleware, async (req, res) => {
  try {
    const rows = await getAll('SELECT * FROM slider_marquee ORDER BY position');
    res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/slider-marquee/:position', authMiddleware, async (req, res) => {
  try {
    const { position } = req.params;
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
    await run("INSERT OR REPLACE INTO slider_marquee (position, items, updated_at) VALUES (?, ?, datetime('now'))", [position, JSON.stringify(items)]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN CRUD — WHATSAPP NUMBERS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/numbers', authMiddleware, async (req, res) => {
  try { res.json(await getAll('SELECT * FROM whatsapp_numbers ORDER BY sort_order')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/numbers', authMiddleware, async (req, res) => {
  try {
    const { number, icon, title, description, badge, icon_bg } = req.body;
    if (!number || !title) return res.status(400).json({ error: 'Number and title required' });
    const maxSort = await getOne('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM whatsapp_numbers');
    const result = await run('INSERT INTO whatsapp_numbers (number, icon, title, description, badge, icon_bg, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [number, icon || '🎯', title, description || '', badge || '', icon_bg || '', maxSort.next]);
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/numbers/reorder', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    await db.batch(ids.map((id, i) => ({ sql: 'UPDATE whatsapp_numbers SET sort_order = ? WHERE id = ?', args: [i, id] })), 'write');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/numbers/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await getOne('SELECT * FROM whatsapp_numbers WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { number, icon, title, description, badge, icon_bg } = req.body;
    await run('UPDATE whatsapp_numbers SET number=?, icon=?, title=?, description=?, badge=?, icon_bg=? WHERE id=?',
      [number || existing.number, icon || existing.icon, title || existing.title,
       description !== undefined ? description : existing.description,
       badge !== undefined ? badge : existing.badge,
       icon_bg !== undefined ? icon_bg : existing.icon_bg,
       req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/numbers/:id', authMiddleware, async (req, res) => {
  try { await run('DELETE FROM whatsapp_numbers WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN CRUD — PAYMENT METHODS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/payment-methods', authMiddleware, async (req, res) => {
  try { res.json(await getAll('SELECT * FROM payment_methods ORDER BY sort_order')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/payment-methods', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { text_value } = req.body;
    const maxSort = await getOne('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM payment_methods');
    if (req.file) {
      const ext = path.extname(req.file.originalname);
      const filename = uuidv4() + ext;
      await run('INSERT INTO file_uploads (filename, data, content_type) VALUES (?, ?, ?)', [filename, req.file.buffer, req.file.mimetype]);
      const result = await run('INSERT INTO payment_methods (type, filename, sort_order) VALUES (?, ?, ?)', ['image', filename, maxSort.next]);
      res.json({ id: Number(result.lastInsertRowid), url: '/uploads/' + filename });
    } else if (text_value) {
      const result = await run('INSERT INTO payment_methods (type, text_value, sort_order) VALUES (?, ?, ?)', ['text', text_value, maxSort.next]);
      res.json({ id: Number(result.lastInsertRowid) });
    } else {
      res.status(400).json({ error: 'Provide text or image' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/payment-methods/reorder', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    await db.batch(ids.map((id, i) => ({ sql: 'UPDATE payment_methods SET sort_order = ? WHERE id = ?', args: [i, id] })), 'write');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/payment-methods/:id', authMiddleware, async (req, res) => {
  try {
    const pm = await getOne('SELECT * FROM payment_methods WHERE id = ?', [req.params.id]);
    if (pm && pm.type === 'image' && pm.filename) {
      await run('DELETE FROM file_uploads WHERE filename = ?', [pm.filename]);
    }
    await run('DELETE FROM payment_methods WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN CRUD — FOOTER LINKS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/footer-links', authMiddleware, async (req, res) => {
  try { res.json(await getAll('SELECT * FROM footer_links ORDER BY sort_order')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/footer-links', authMiddleware, async (req, res) => {
  try {
    const { icon, icon_bg, label, sub, url, is_emergency } = req.body;
    if (!label || !url) return res.status(400).json({ error: 'Label and URL required' });
    const maxSort = await getOne('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM footer_links');
    const result = await run('INSERT INTO footer_links (icon, icon_bg, label, sub, url, is_emergency, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [icon || '🔗', icon_bg || '', label, sub || '', url, is_emergency || 0, maxSort.next]);
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/footer-links/reorder', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    await db.batch(ids.map((id, i) => ({ sql: 'UPDATE footer_links SET sort_order = ? WHERE id = ?', args: [i, id] })), 'write');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/footer-links/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await getOne('SELECT * FROM footer_links WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { icon, icon_bg, label, sub, url, is_emergency } = req.body;
    await run('UPDATE footer_links SET icon=?, icon_bg=?, label=?, sub=?, url=?, is_emergency=? WHERE id=?',
      [icon || existing.icon,
       icon_bg !== undefined ? icon_bg : existing.icon_bg,
       label || existing.label,
       sub !== undefined ? sub : existing.sub,
       url || existing.url,
       is_emergency !== undefined ? is_emergency : existing.is_emergency,
       req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/footer-links/:id', authMiddleware, async (req, res) => {
  try { await run('DELETE FROM footer_links WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — SERVICES
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/services', authMiddleware, async (req, res) => {
  try { res.json(await getAll('SELECT * FROM services ORDER BY sort_order')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/services', authMiddleware, async (req, res) => {
  try {
    const { title, description, icon } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Title and description required' });
    const maxSort = await getOne('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM services');
    const result = await run('INSERT INTO services (title, description, icon, sort_order) VALUES (?, ?, ?, ?)', [title, description, icon || '✨', maxSort.next]);
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/services/reorder', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    await db.batch(ids.map((id, i) => ({ sql: 'UPDATE services SET sort_order = ? WHERE id = ?', args: [i, id] })), 'write');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/services/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, icon } = req.body;
    await run('UPDATE services SET title=?, description=?, icon=? WHERE id=?', [title, description, icon, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/services/:id', authMiddleware, async (req, res) => {
  try { await run('DELETE FROM services WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — FOOTER THEME
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/footer-theme', authMiddleware, async (req, res) => {
  try {
    const row = await getOne("SELECT value FROM settings WHERE key = 'footer_theme'");
    res.json({ theme: row ? row.value : 'neon-green' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/footer-theme', authMiddleware, async (req, res) => {
  try {
    const { theme } = req.body;
    const valid = ['neon-green', 'cyber-purple', 'ocean-blue', 'sunset-fire', 'gold-premium', 'royal-purple'];
    if (!valid.includes(theme)) return res.status(400).json({ error: 'Invalid theme' });
    await upsertSetting('footer_theme', theme);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — MARQUEE SPEED
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/marquee-speed', authMiddleware, async (req, res) => {
  try {
    const mainSpeed = await getOne("SELECT value FROM settings WHERE key = 'marquee_speed'");
    const sliderSpeed = await getOne("SELECT value FROM settings WHERE key = 'slider_speed'");
    const verticalSpeed = await getOne("SELECT value FROM settings WHERE key = 'vertical_speed'");
    res.json({
      marquee_speed: mainSpeed ? parseInt(mainSpeed.value) : 30,
      slider_speed: sliderSpeed ? parseInt(sliderSpeed.value) : 20,
      vertical_speed: verticalSpeed ? parseInt(verticalSpeed.value) : 18
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/marquee-speed', authMiddleware, async (req, res) => {
  try {
    const { marquee_speed, slider_speed, vertical_speed } = req.body;
    if (marquee_speed && marquee_speed >= 5 && marquee_speed <= 120) await upsertSetting('marquee_speed', String(marquee_speed));
    if (slider_speed && slider_speed >= 5 && slider_speed <= 120) await upsertSetting('slider_speed', String(slider_speed));
    if (vertical_speed && vertical_speed >= 5 && vertical_speed <= 120) await upsertSetting('vertical_speed', String(vertical_speed));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════════════

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`AlphaXchng CMS running at http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin/`);
    console.log(`Default password: admin123`);
  });
}
