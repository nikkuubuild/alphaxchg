const express = require('express');
const Database = require('better-sqlite3');
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

// ─── Middleware ───
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Upload config ───
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Database ───
const DB_PATH = path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───
db.exec(`
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
    icon TEXT DEFAULT '🎯',
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
`);

// ─── Migrations ───
try { db.exec("ALTER TABLE marquee_items ADD COLUMN color TEXT DEFAULT '#ffffff'"); } catch(e) { /* column already exists */ }

// Copy all payment images from image/ to uploads/ if missing
['img-1780125272468.png','img-1780125292677.png','img-1780125299767.png','img-1780125305892.png','img-1780125371741.png','img-1780125379113.png','img-1780125385570.png','img-1780125391713.png','img-1780125397447.png','img-1780125403938.png'].forEach(f => {
  const src = path.join(__dirname, 'image', f);
  const dest = path.join(uploadsDir, f);
  if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest);
});

// ─── Seed ───
const adminPassword = bcrypt.hashSync('admin123', 10);
const upsertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
upsertSetting.run('admin_password', adminPassword);

const countMarquee = db.prepare('SELECT COUNT(*) as c FROM marquee_items').get();
if (countMarquee.c === 0) {
  const insert = db.prepare('INSERT INTO marquee_items (text, sort_order) VALUES (?, ?)');
  const items = [
    'Trusted by 10,000+ traders worldwide',
    'ID delivery in under 5 minutes',
    '100% secure · military-grade encryption',
    '24/7 premium customer support',
    'Fastest KYC verification in the market'
  ];
  items.forEach((t, i) => insert.run(t, i));
}

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const countSlider = db.prepare('SELECT COUNT(*) as c FROM slider_images').get();
if (countSlider.c === 0) {
  const dir = path.join(__dirname, 'image');
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    const insert = db.prepare('INSERT INTO slider_images (filename, original_name, sort_order) VALUES (?, ?, ?)');
    files.forEach((f, i) => {
      fs.copyFileSync(path.join(dir, f), path.join(uploadsDir, f));
      insert.run(f, f, i);
    });
  }
}

const countSM = db.prepare('SELECT COUNT(*) as c FROM slider_marquee').get();
if (countSM.c === 0) {
  const insert = db.prepare('INSERT INTO slider_marquee (position, items) VALUES (?, ?)');
  const positions = {
    top: ['Ultra-low latency execution', 'Real-time market data', 'Bank-grade security', 'White-glove onboarding'],
    bottom: ['500+ tradable instruments', 'Instant fiat withdrawals', 'Deep liquidity pools', 'Copy trading enabled'],
    left: ['ONE-CLICK TRADE', 'ZERO FEES', 'INSTANT SETUP', 'VIP PERKS'],
    right: ['DEEP LIQUIDITY', 'PRO DASHBOARD', 'RISK MANAGER', 'FAST MATCHING']
  };
  Object.entries(positions).forEach(([pos, items]) => insert.run(pos, JSON.stringify(items)));
}

const countNum = db.prepare('SELECT COUNT(*) as c FROM whatsapp_numbers').get();
if (countNum.c === 0) {
  const insert = db.prepare('INSERT INTO whatsapp_numbers (number, icon, title, description, badge, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const nums = [
    ['8651381149', '🎯', 'GET ID 1', 'Primary support line', 'HOT', 0],
    ['7542943418', '⚡', 'GET ID 2', 'Fast track — 2min delivery', 'FAST', 1],
    ['8235817872', '🔄', 'GET ID 3', 'Additional agents online', 'READY', 2],
    ['9472194303', '🛟', 'HELP & SUPPORT', 'General enquiries', '24/7', 3]
  ];
  nums.forEach(n => insert.run(...n));
}

const countPay = db.prepare('SELECT COUNT(*) as c FROM payment_methods').get();
if (countPay.c === 0) {
  const insert = db.prepare('INSERT INTO payment_methods (type, filename, text_value, sort_order) VALUES (?, ?, ?, ?)');
  var payImages = [
    'img-1780125272468.png', 'img-1780125292677.png', 'img-1780125299767.png',
    'img-1780125305892.png', 'img-1780125371741.png', 'img-1780125379113.png',
    'img-1780125385570.png', 'img-1780125391713.png', 'img-1780125397447.png',
    'img-1780125403938.png'
  ];
  var payIdx = 0;
  payImages.forEach(function(f) {
    var src = path.join(__dirname, 'image', f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(uploadsDir, f));
      insert.run('image', f, null, payIdx++);
    }
  });
  insert.run('text', null, 'USDT', payIdx++);
  insert.run('text', null, 'BTC', payIdx++);
  insert.run('text', null, 'ETH', payIdx++);
}

const countFooter = db.prepare('SELECT COUNT(*) as c FROM footer_links').get();
if (countFooter.c === 0) {
  const insert = db.prepare('INSERT INTO footer_links (icon, icon_bg, label, sub, url, is_emergency, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insert.run('✈️', 'linear-gradient(135deg,rgba(0,136,204,0.12),rgba(0,136,204,0.04))', 'Telegram Channel', '@AlphaXchng_Official', 'https://t.me/AlphaXchng_Official', 0, 0);
  insert.run('📸', 'linear-gradient(135deg,rgba(225,48,108,0.12),rgba(225,48,108,0.04))', 'Instagram', '@alphaxchng', 'https://instagram.com/alphaxchng', 0, 1);
  insert.run('💬', 'linear-gradient(135deg,rgba(139,195,74,0.12),rgba(139,195,74,0.04))', 'Emergency Support', 'Tap to chat on WhatsApp', 'https://wa.me/919999999999', 1, 2);
}

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

// ═════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═════════════════════════════════════════════════════════════════════

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get();
  if (!stored || !bcrypt.compareSync(password, stored.value)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ token });
});

app.post('/api/change-password', authMiddleware, (req, res) => {
  const { current, newPassword } = req.body;
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get();
  if (!stored || !bcrypt.compareSync(current, stored.value)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (newPassword.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const hash = bcrypt.hashSync(newPassword, 10);
  upsertSetting.run('admin_password', hash);
  res.json({ success: true });
});

app.get('/api/check-auth', authMiddleware, (req, res) => res.json({ authenticated: true }));

// ═════════════════════════════════════════════════════════════════════
//  PUBLIC API — used by frontend
// ═════════════════════════════════════════════════════════════════════

app.get('/api/public/all', (req, res) => {
  const data = {};

  data.marquee = db.prepare('SELECT text, color FROM marquee_items ORDER BY sort_order').all();

  const sliderImages = db.prepare('SELECT filename FROM slider_images ORDER BY sort_order').all();
  data.sliderImages = sliderImages.map(r => '/uploads/' + r.filename);

  const sm = db.prepare('SELECT position, items FROM slider_marquee').all();
  data.sliderMarquee = {};
  sm.forEach(r => { data.sliderMarquee[r.position] = JSON.parse(r.items); });

  data.numbers = db.prepare('SELECT number, icon, title, description, badge, icon_bg FROM whatsapp_numbers ORDER BY sort_order').all();

  const paymentMethods = db.prepare('SELECT type, filename, text_value FROM payment_methods ORDER BY sort_order').all();
  data.paymentMethods = paymentMethods.map(r => ({
    img: r.type === 'image' ? '/uploads/' + r.filename : null,
    text: r.type === 'text' ? r.text_value : null
  }));

  data.footerLinks = db.prepare('SELECT icon, icon_bg, label, sub, url, is_emergency FROM footer_links ORDER BY sort_order').all();

  const footerTheme = db.prepare("SELECT value FROM settings WHERE key = 'footer_theme'").get();
  data.footerTheme = footerTheme ? footerTheme.value : 'neon-green';

  res.json(data);
});

// ═════════════════════════════════════════════════════════════════════
//  ADMIN CRUD — MARQUEE ITEMS
// ═════════════════════════════════════════════════════════════════════

app.get('/api/admin/marquee-items', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM marquee_items ORDER BY sort_order').all());
});

app.post('/api/admin/marquee-items', authMiddleware, (req, res) => {
  const { text, color } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM marquee_items').get();
  const result = db.prepare('INSERT INTO marquee_items (text, color, sort_order) VALUES (?, ?, ?)').run(text, color || '#ffffff', maxSort.next);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/admin/marquee-items/:id', authMiddleware, (req, res) => {
  const { text, color } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });
  db.prepare('UPDATE marquee_items SET text = ?, color = ? WHERE id = ?').run(text, color || '#ffffff', req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/marquee-items/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM marquee_items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/admin/marquee-items/reorder', authMiddleware, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  const update = db.prepare('UPDATE marquee_items SET sort_order = ? WHERE id = ?');
  const txn = db.transaction(() => ids.forEach((id, i) => update.run(i, id)));
  txn();
  res.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════════
//  ADMIN CRUD — SLIDER IMAGES
// ═════════════════════════════════════════════════════════════════════

app.get('/api/admin/slider-images', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM slider_images ORDER BY sort_order').all());
});

app.post('/api/admin/slider-images', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image file required' });
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM slider_images').get();
  const result = db.prepare('INSERT INTO slider_images (filename, original_name, sort_order) VALUES (?, ?, ?)').run(req.file.filename, req.file.originalname, maxSort.next);
  res.json({ id: result.lastInsertRowid, url: '/uploads/' + req.file.filename });
});

app.delete('/api/admin/slider-images/:id', authMiddleware, (req, res) => {
  const img = db.prepare('SELECT filename FROM slider_images WHERE id = ?').get(req.params.id);
  if (img) {
    const fpath = path.join(__dirname, 'uploads', img.filename);
    if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
    db.prepare('DELETE FROM slider_images WHERE id = ?').run(req.params.id);
  }
  res.json({ success: true });
});

app.put('/api/admin/slider-images/reorder', authMiddleware, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  const update = db.prepare('UPDATE slider_images SET sort_order = ? WHERE id = ?');
  const txn = db.transaction(() => ids.forEach((id, i) => update.run(i, id)));
  txn();
  res.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════════
//  ADMIN CRUD — SLIDER MARQUEE
// ═════════════════════════════════════════════════════════════════════

app.get('/api/admin/slider-marquee', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM slider_marquee ORDER BY position').all();
  res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items) })));
});

app.put('/api/admin/slider-marquee/:position', authMiddleware, (req, res) => {
  const { position } = req.params;
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
  db.prepare('INSERT OR REPLACE INTO slider_marquee (position, items, updated_at) VALUES (?, ?, datetime(\'now\'))').run(position, JSON.stringify(items));
  res.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════════
//  ADMIN CRUD — WHATSAPP NUMBERS
// ═════════════════════════════════════════════════════════════════════

app.get('/api/admin/numbers', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM whatsapp_numbers ORDER BY sort_order').all());
});

app.post('/api/admin/numbers', authMiddleware, (req, res) => {
  const { number, icon, title, description, badge, icon_bg } = req.body;
  if (!number || !title) return res.status(400).json({ error: 'Number and title required' });
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM whatsapp_numbers').get();
  const result = db.prepare('INSERT INTO whatsapp_numbers (number, icon, title, description, badge, icon_bg, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)').run(number, icon || '🎯', title, description || '', badge || '', icon_bg || '', maxSort.next);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/admin/numbers/:id', authMiddleware, (req, res) => {
  const { number, icon, title, description, badge, icon_bg } = req.body;
  db.prepare('UPDATE whatsapp_numbers SET number=?, icon=?, title=?, description=?, badge=?, icon_bg=? WHERE id=?').run(number, icon, title, description, badge, icon_bg, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/numbers/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM whatsapp_numbers WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/admin/numbers/reorder', authMiddleware, (req, res) => {
  const { ids } = req.body;
  const update = db.prepare('UPDATE whatsapp_numbers SET sort_order = ? WHERE id = ?');
  const txn = db.transaction(() => ids.forEach((id, i) => update.run(i, id)));
  txn();
  res.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════════
//  ADMIN CRUD — PAYMENT METHODS
// ═════════════════════════════════════════════════════════════════════

app.get('/api/admin/payment-methods', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM payment_methods ORDER BY sort_order').all());
});

app.post('/api/admin/payment-methods', authMiddleware, upload.single('image'), (req, res) => {
  const { text_value } = req.body;
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM payment_methods').get();
  if (req.file) {
    const result = db.prepare('INSERT INTO payment_methods (type, filename, sort_order) VALUES (?, ?, ?)').run('image', req.file.filename, maxSort.next);
    res.json({ id: result.lastInsertRowid, url: '/uploads/' + req.file.filename });
  } else if (text_value) {
    const result = db.prepare('INSERT INTO payment_methods (type, text_value, sort_order) VALUES (?, ?, ?)').run('text', text_value, maxSort.next);
    res.json({ id: result.lastInsertRowid });
  } else {
    res.status(400).json({ error: 'Provide text or image' });
  }
});

app.delete('/api/admin/payment-methods/:id', authMiddleware, (req, res) => {
  const pm = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(req.params.id);
  if (pm && pm.type === 'image' && pm.filename) {
    const fpath = path.join(__dirname, 'uploads', pm.filename);
    if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
  }
  db.prepare('DELETE FROM payment_methods WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/admin/payment-methods/reorder', authMiddleware, (req, res) => {
  const { ids } = req.body;
  const update = db.prepare('UPDATE payment_methods SET sort_order = ? WHERE id = ?');
  const txn = db.transaction(() => ids.forEach((id, i) => update.run(i, id)));
  txn();
  res.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════════
//  ADMIN CRUD — FOOTER LINKS
// ═════════════════════════════════════════════════════════════════════

app.get('/api/admin/footer-links', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM footer_links ORDER BY sort_order').all());
});

app.post('/api/admin/footer-links', authMiddleware, (req, res) => {
  const { icon, icon_bg, label, sub, url, is_emergency } = req.body;
  if (!label || !url) return res.status(400).json({ error: 'Label and URL required' });
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM footer_links').get();
  const result = db.prepare('INSERT INTO footer_links (icon, icon_bg, label, sub, url, is_emergency, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)').run(icon || '🔗', icon_bg || '', label, sub || '', url, is_emergency || 0, maxSort.next);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/admin/footer-links/:id', authMiddleware, (req, res) => {
  const { icon, icon_bg, label, sub, url, is_emergency } = req.body;
  db.prepare('UPDATE footer_links SET icon=?, icon_bg=?, label=?, sub=?, url=?, is_emergency=? WHERE id=?').run(icon, icon_bg, label, sub, url, is_emergency, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/footer-links/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM footer_links WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/admin/footer-links/reorder', authMiddleware, (req, res) => {
  const { ids } = req.body;
  const update = db.prepare('UPDATE footer_links SET sort_order = ? WHERE id = ?');
  const txn = db.transaction(() => ids.forEach((id, i) => update.run(i, id)));
  txn();
  res.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════════
//  ADMIN — FOOTER THEME
// ═════════════════════════════════════════════════════════════════════

app.get('/api/admin/footer-theme', authMiddleware, (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'footer_theme'").get();
  res.json({ theme: row ? row.value : 'neon-green' });
});

app.put('/api/admin/footer-theme', authMiddleware, (req, res) => {
  const { theme } = req.body;
  const valid = ['neon-green', 'cyber-purple', 'ocean-blue', 'sunset-fire', 'gold-premium'];
  if (!valid.includes(theme)) return res.status(400).json({ error: 'Invalid theme' });
  upsertSetting.run('footer_theme', theme);
  res.json({ success: true });
});

// ═════════════════════════════════════════════════════════════════════
//  START
// ═════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`AlphaXchng CMS running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin/`);
  console.log(`Default password: admin123`);
});
