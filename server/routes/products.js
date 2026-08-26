import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import db, { logActivity } from '../db/database.js';
import { analyzeProduct } from '../services/aiAnalyzer.js';
import { CATEGORIES } from '../services/categories.js';
import { requireAuth, requireRole } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const MIN_IMAGES = 2;
const MAX_IMAGES = 5;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per poză
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Format neacceptat. Folosește JPG, PNG sau WEBP.'), ok);
  }
});

const router = express.Router();

function serialize(row) {
  return {
    ...row,
    imagePaths: row.image_paths ? JSON.parse(row.image_paths) : [],
    aiCharacteristics: row.ai_characteristics ? JSON.parse(row.ai_characteristics) : [],
    agentLog: row.agent_log ? JSON.parse(row.agent_log) : [],
    aiFailed: Boolean(row.ai_failed),
    aiError: row.ai_error || null,
    needsManualReview: Boolean(row.needs_manual_review),
  };
}

function unlinkAll(files) {
  for (const f of files) {
    if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
  }
}

// Citește sesiunea (dacă există) fără să blocheze — rutele publice (GET)
// rămân accesibile fără cont, dar requireOwner de mai jos poate folosi
// req.user când e disponibil, pentru produsele create prin fluxul autenticat.
router.use((req, res, next) => {
  if (req.session?.userId) {
    req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId) || null;
  }
  next();
});

// Autorizare pe proprietar. Produsele noi au supplier_id (creat de un
// furnizor autentificat) — verificarea reală e id-ul din sesiune. Produsele
// vechi, create înainte de autentificare (supplier_id NULL), rămân pe
// verificarea veche prin nume declarat, ca să nu devină needitabile pentru
// nimeni (nu mai există cont de legat de ele retroactiv).
function requireOwner(req, res, existing) {
  if (existing.supplier_id) {
    if (!req.user || req.user.id !== existing.supplier_id) {
      res.status(403).json({ error: 'Nu ești autorizat să modifici acest produs — autentifică-te cu contul furnizorului.' });
      return false;
    }
    return true;
  }
  const claimed = (req.get('x-supplier-name') || req.body?.supplierName || '').trim().toLowerCase();
  const actual = (existing.supplier_name || '').trim().toLowerCase();
  if (!claimed || claimed !== actual) {
    res.status(403).json({ error: 'Nu ești autorizat să modifici acest produs — numele furnizorului nu corespunde.' });
    return false;
  }
  return true;
}

// GET /api/products?status=published -> pentru marketplace public
// GET /api/products?mine=true -> produsele furnizorului autentificat curent
router.get('/', (req, res) => {
  const { status, category, search, mine } = req.query;
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (mine === 'true') {
    if (!req.user) return res.status(401).json({ error: 'Trebuie să fii autentificat.' });
    query += ' AND supplier_id = ?'; params.push(req.user.id);
  }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (category) { query += ' AND ai_category = ?'; params.push(category); }
  if (search) { query += ' AND (ai_title LIKE ? OR ai_description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  query += ' ORDER BY created_at DESC';
  const rows = db.prepare(query).all(...params);
  res.json(rows.map(serialize));
});

router.get('/categories', (req, res) => res.json(CATEGORIES));

// Publice sunt doar produsele publicate — un draft/pending_review e vizibil
// doar furnizorului proprietar sau unui admin (altfel oricine ar putea vedea
// conținutul unui produs nepublicat doar ghicindu-i/aflându-i id-ul).
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Produsul nu a fost găsit.' });

  const isOwner = req.user && row.supplier_id && req.user.id === row.supplier_id;
  const isAdmin = req.user && req.user.role === 'admin';
  if (row.status !== 'published' && !isOwner && !isAdmin) {
    return res.status(404).json({ error: 'Produsul nu a fost găsit.' });
  }

  res.json(serialize(row));
});

// Pas 1: furnizorul încarcă 2-5 poze + info de bază -> AI generează draftul.
// Necesită cont de furnizor autentificat — numele afișat pe produs vine din
// cont (req.user.name), nu mai e declarat liber în formular.
router.post('/analyze', requireAuth, requireRole('supplier'), upload.array('images', MAX_IMAGES), async (req, res) => {
  const files = req.files || [];

  if (files.length < MIN_IMAGES) {
    unlinkAll(files);
    return res.status(400).json({ error: `Încarcă cel puțin ${MIN_IMAGES} poze ale produsului (max ${MAX_IMAGES}).` });
  }

  const supplierName = req.user.name;
  const { supplierContact, rawName, rawPrice, rawQuantity, rawNotes } = req.body;

  // Pozele sunt deja salvate pe disc de multer în acest punct (upload-ul a
  // reușit). Dacă analyzeProduct() aruncă — billing, timeout, rate limit,
  // model indisponibil, orice — NU le mai ștergem și NU mai picăm cu 500:
  // produsul se inserează oricum, cu conținutul AI gol și ai_failed=true,
  // ca furnizorul să ajungă pe pagina de review cu pozele deja acolo și un
  // buton de reîncercare, nu obligat s-o ia de la capăt.
  let ai = null;
  let log = [];
  let aiFailed = false;
  let aiError = null;
  try {
    const result = await analyzeProduct({
      imagePaths: files.map((f) => f.path),
      rawName, rawPrice, rawQuantity, rawNotes
    });
    ai = result.draft;
    log = result.log;
  } catch (err) {
    console.error('Eroare analiză AI:', err);
    aiFailed = true;
    aiError = err.message || String(err);
  }

  const id = uuidv4();
  const imagePaths = files.map((f) => `/uploads/${f.filename}`);
  db.prepare(`
    INSERT INTO products (
      id, supplier_name, supplier_id, supplier_contact, image_paths,
      raw_name, raw_price, raw_quantity, raw_notes,
      ai_title, ai_description, ai_category, ai_characteristics, ai_confidence_notes, agent_log,
      ai_failed, ai_error, needs_manual_review,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review')
  `).run(
    id, supplierName, req.user.id, supplierContact || null, JSON.stringify(imagePaths),
    rawName || null, rawPrice ? Number(rawPrice) : null, rawQuantity || null, rawNotes || null,
    ai?.title ?? null, ai?.description ?? null, ai?.category ?? null,
    JSON.stringify(ai?.characteristics || []), ai?.confidenceNotes ?? '',
    JSON.stringify(log),
    aiFailed ? 1 : 0, aiError, ai?.needsManualReview ? 1 : 0
  );

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.status(201).json(serialize(row));
});

// Reîncearcă analiza AI pentru un produs existent, cu pozele deja salvate
// (fără reupload) — folosită după un eșec (ai_failed=true), dar funcționează
// oricând, ex. dacă furnizorul vrea pur și simplu o altă variantă.
router.post('/:id/retry-analysis', async (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produsul nu a fost găsit.' });
  if (!requireOwner(req, res, existing)) return;

  const imagePaths = (existing.image_paths ? JSON.parse(existing.image_paths) : []).map((p) => path.join(__dirname, '..', p));

  try {
    const { draft: ai, log } = await analyzeProduct({
      imagePaths,
      rawName: existing.raw_name,
      rawPrice: existing.raw_price,
      rawQuantity: existing.raw_quantity,
      rawNotes: existing.raw_notes,
    });
    db.prepare(`
      UPDATE products SET
        ai_title = ?, ai_description = ?, ai_category = ?, ai_characteristics = ?, ai_confidence_notes = ?,
        agent_log = ?, ai_failed = 0, ai_error = NULL, needs_manual_review = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(ai.title, ai.description, ai.category, JSON.stringify(ai.characteristics || []), ai.confidenceNotes || '', JSON.stringify(log), ai.needsManualReview ? 1 : 0, req.params.id);
  } catch (err) {
    console.error('Eroare la reîncercarea analizei AI:', err);
    db.prepare(`UPDATE products SET ai_failed = 1, ai_error = ?, updated_at = datetime('now') WHERE id = ?`).run(err.message || String(err), req.params.id);
  }

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(serialize(row));
});

// Pas 2: furnizorul editează conținutul generat de AI. Nu schimbă status-ul
// (rămâne pending_review sau draft, ce era înainte) — DOAR acțiunea explicită
// "Salvează ca ciornă" trece status-ul pe 'draft' (vezi mai jos, body.status).
// Prima editare/salvare marchează reviewed_at, ca să distingem în dashboard
// "AI a generat, nimeni nu s-a uitat încă" de "furnizorul a văzut/editat".
router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produsul nu a fost găsit.' });
  if (!requireOwner(req, res, existing)) return;

  const { aiTitle, aiDescription, aiCategory, aiCharacteristics, rawPrice, rawQuantity, status, stockQuantity, stockPaused } = req.body;

  // Singura tranziție de status permisă prin PATCH e "salvează ca ciornă" —
  // publicarea/retragerea au rutele lor dedicate, cu semantica proprie.
  const nextStatus = status === 'draft' ? 'draft' : null;
  const reviewedAt = existing.reviewed_at ? null : new Date().toISOString();

  // stockQuantity/stockPaused nu pot folosi COALESCE(?, coloană) ca restul —
  // `null` e o valoare validă și intenționată pentru stockQuantity (stoc
  // nelimitat/nespecificat), iar `false` e o valoare validă pentru
  // stockPaused (repornește vânzarea) — COALESCE le-ar trata greșit ca
  // "lipsă", păstrând valoarea veche în loc s-o suprascrie. Distincția se
  // face în JS, înainte de query, pe baza lui `undefined` (câmp neatins de
  // formularul curent) vs. `null`/`false` (valoare explicit trimisă).
  const nextStockQuantity = stockQuantity !== undefined ? stockQuantity : existing.stock_quantity;
  const nextStockPaused = stockPaused !== undefined ? (stockPaused ? 1 : 0) : existing.stock_paused;

  db.prepare(`
    UPDATE products SET
      ai_title = COALESCE(?, ai_title),
      ai_description = COALESCE(?, ai_description),
      ai_category = COALESCE(?, ai_category),
      ai_characteristics = COALESCE(?, ai_characteristics),
      raw_price = COALESCE(?, raw_price),
      raw_quantity = COALESCE(?, raw_quantity),
      status = COALESCE(?, status),
      reviewed_at = COALESCE(reviewed_at, ?),
      stock_quantity = ?,
      stock_paused = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    aiTitle ?? null,
    aiDescription ?? null,
    aiCategory ?? null,
    aiCharacteristics ? JSON.stringify(aiCharacteristics) : null,
    rawPrice ?? null,
    rawQuantity ?? null,
    nextStatus,
    reviewedAt,
    nextStockQuantity,
    nextStockPaused,
    req.params.id
  );

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(serialize(row));
});

// Pas 3: furnizorul aprobă și publică produsul pe marketplace.
// Acceptă doar din pending_review sau draft — un produs deja publicat nu se
// "re-publică" prin ruta asta (ar trebui întâi retras, vezi /unpublish).
router.post('/:id/publish', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produsul nu a fost găsit.' });
  if (!requireOwner(req, res, existing)) return;
  if (!['pending_review', 'draft'].includes(existing.status)) {
    return res.status(409).json({ error: `Produsul e deja "${existing.status}" — nu poate fi publicat din nou din această stare.` });
  }

  db.prepare(`UPDATE products SET status = 'published', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  logActivity('product_published', existing.ai_title || existing.supplier_name, req.user?.id || null);
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(serialize(row));
});

// Retrage un produs publicat înapoi în draft (nu în pending_review — a fost
// deja revizuit cel puțin o dată, ca să ajungă publicat).
router.post('/:id/unpublish', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produsul nu a fost găsit.' });
  if (!requireOwner(req, res, existing)) return;
  if (existing.status !== 'published') {
    return res.status(409).json({ error: `Produsul nu e publicat (status curent: "${existing.status}") — nu are ce fi retras.` });
  }

  db.prepare(`UPDATE products SET status = 'draft', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(serialize(row));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produsul nu a fost găsit.' });
  if (!requireOwner(req, res, existing)) return;

  const imagePaths = existing.image_paths ? JSON.parse(existing.image_paths) : [];
  for (const relPath of imagePaths) {
    const imgPath = path.join(__dirname, '..', relPath);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;
