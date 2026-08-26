import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// node:sqlite — modulul SQLite nativ inclus în Node.js (>=22.5), fără
// compilare C++. Înlocuiește better-sqlite3, care necesită Visual Studio
// Build Tools (indisponibile pe această mașină) pentru instalare pe Windows.
// API-ul .prepare()/.run()/.get()/.all() e păstrat identic — restul
// codului (routes/products.js, tools/similarProducts.js) nu s-a schimbat.
const db = new DatabaseSync(path.join(__dirname, 'marketplace.sqlite'));

db.exec('PRAGMA journal_mode = WAL');

// Schema principală: un produs trece prin fluxul
// pending_review (generat de AI, nerevizuit) -> draft (editat, lăsat pentru mai târziu) -> published
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    supplier_name TEXT NOT NULL,
    supplier_contact TEXT,
    image_paths TEXT NOT NULL DEFAULT '[]', -- JSON array cu 2-5 căi de poze

    -- informații brute introduse de furnizor
    raw_name TEXT,
    raw_price REAL,
    raw_quantity TEXT,
    raw_notes TEXT,

    -- conținut generat de AI (editabil ulterior de furnizor)
    ai_title TEXT,
    ai_description TEXT,
    ai_category TEXT,
    ai_characteristics TEXT, -- JSON array serializat
    ai_confidence_notes TEXT, -- ex: "nu am putut determina soiul floral cu certitudine"
    agent_log TEXT, -- JSON: pașii agentului (tool calls, verdict evaluator) — transparență

    ai_failed INTEGER NOT NULL DEFAULT 0, -- 1 dacă analyzeProduct() a aruncat (billing, timeout, rate limit etc.)
    ai_error TEXT, -- mesajul erorii, păstrat pentru debug — nu arătat direct furnizorului ca atare
    needs_manual_review INTEGER NOT NULL DEFAULT 0, -- 1 dacă validateListing() (fără AI) a găsit un tipar de problemă cunoscut

    status TEXT NOT NULL DEFAULT 'pending_review', -- pending_review | draft | published
    reviewed_at TEXT, -- setat la prima editare/salvare explicită a furnizorului
    stock_quantity INTEGER, -- NULL = nelimitat/nespecificat; altfel, numărul rămas
    stock_paused INTEGER NOT NULL DEFAULT 0, -- 1 = furnizorul a oprit manual vânzarea, indiferent de cantitate
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Conturi reale (furnizori, cumpărători, admin) — înlocuiesc identificarea
// prin nume simplu, folosită înainte de autentificare.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'buyer', -- buyer | supplier | admin
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Comenzi plasate de cumpărători — fără plată reală integrată (vezi FAQ),
// doar înregistrarea comenzii, ca admin-ul să aibă date reale de arătat.
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    buyer_id TEXT NOT NULL REFERENCES users(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    price_at_order REAL,
    status TEXT NOT NULL DEFAULT 'placed', -- placed | (extensibil ulterior)
    shipping_name TEXT,
    shipping_address TEXT,
    shipping_phone TEXT,
    payment_method TEXT NOT NULL DEFAULT 'ramburs', -- card | ramburs
    stripe_session_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Jurnal simplu de activitate — evenimente de business (înregistrare,
// publicare, comandă), nu tracking de pageview-uri. Folosit de admin ca
// "ce s-a întâmplat pe site", nu ca sistem de analytics complet.
db.exec(`
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL,
    detail TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export function logActivity(event, detail = '', userId = null) {
  db.prepare('INSERT INTO activity_log (event, detail, user_id) VALUES (?, ?, ?)').run(event, detail, userId);
}

// Produsele noi (create de un furnizor autentificat) sunt legate de contul
// lui prin supplier_id — produsele vechi (create anonim, înainte de
// autentificare) rămân neatinse, cu supplier_id NULL, doar vizibile, nu
// editabile prin fluxul nou.
{
  const cols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  if (!cols.includes('supplier_id')) {
    db.exec('ALTER TABLE products ADD COLUMN supplier_id TEXT REFERENCES users(id)');
  }
}

// Migrare defensivă, idempotentă — utilă dacă rulează cineva peste o bază
// de date creată cu o versiune anterioară a schemei (înainte de status pe
// 3 stări / poze multiple). Pe o bază nouă, coloanele există deja din
// CREATE TABLE de mai sus, deci ALTER TABLE de mai jos nu se execută.
const existingColumns = new Set(db.prepare('PRAGMA table_info(products)').all().map((c) => c.name));
if (!existingColumns.has('reviewed_at')) {
  db.exec("ALTER TABLE products ADD COLUMN reviewed_at TEXT");
}
if (!existingColumns.has('ai_failed')) {
  db.exec("ALTER TABLE products ADD COLUMN ai_failed INTEGER NOT NULL DEFAULT 0");
}
if (!existingColumns.has('ai_error')) {
  db.exec("ALTER TABLE products ADD COLUMN ai_error TEXT");
}
if (!existingColumns.has('needs_manual_review')) {
  db.exec("ALTER TABLE products ADD COLUMN needs_manual_review INTEGER NOT NULL DEFAULT 0");
}
if (!existingColumns.has('stock_quantity')) {
  db.exec('ALTER TABLE products ADD COLUMN stock_quantity INTEGER');
}
if (!existingColumns.has('stock_paused')) {
  db.exec('ALTER TABLE products ADD COLUMN stock_paused INTEGER NOT NULL DEFAULT 0');
}
if (!existingColumns.has('image_paths')) {
  db.exec("ALTER TABLE products ADD COLUMN image_paths TEXT NOT NULL DEFAULT '[]'");
  // backfill dintr-o eventuală coloană veche `image_path` (singulară, o poză)
  if (existingColumns.has('image_path')) {
    for (const row of db.prepare('SELECT id, image_path FROM products').all()) {
      if (row.image_path) {
        db.prepare('UPDATE products SET image_paths = ? WHERE id = ?').run(JSON.stringify([row.image_path]), row.id);
      }
    }
  }
}

// Migrare defensivă pentru orders — adresă de livrare + metodă de plată
// adăugate ulterior primei scheme; ALTER TABLE nu se execută pe o bază
// nouă, unde coloanele există deja din CREATE TABLE de mai sus.
const existingOrderColumns = new Set(db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name));
if (!existingOrderColumns.has('shipping_name')) {
  db.exec('ALTER TABLE orders ADD COLUMN shipping_name TEXT');
}
if (!existingOrderColumns.has('shipping_address')) {
  db.exec('ALTER TABLE orders ADD COLUMN shipping_address TEXT');
}
if (!existingOrderColumns.has('shipping_phone')) {
  db.exec('ALTER TABLE orders ADD COLUMN shipping_phone TEXT');
}
if (!existingOrderColumns.has('payment_method')) {
  db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'ramburs'");
}
if (!existingOrderColumns.has('stripe_session_id')) {
  db.exec('ALTER TABLE orders ADD COLUMN stripe_session_id TEXT');
}

export default db;
