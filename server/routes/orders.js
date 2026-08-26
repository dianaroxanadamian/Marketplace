import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';
import db, { logActivity } from '../db/database.js';
import { requireAuth, requireRole } from './auth.js';

const router = express.Router();

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Stripe e opțional — dacă lipsește cheia din .env, plata cu cardul e
// dezactivată la nivel de rută (503), dar ramburs funcționează neschimbat,
// fără nicio dependință externă.
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

function serialize(row) {
  return {
    id: row.id,
    quantity: row.quantity,
    priceAtOrder: row.price_at_order,
    status: row.status,
    shippingName: row.shipping_name,
    shippingAddress: row.shipping_address,
    shippingPhone: row.shipping_phone,
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
    product: {
      id: row.product_id,
      title: row.ai_title,
      imagePaths: row.image_paths ? JSON.parse(row.image_paths) : [],
      supplierName: row.supplier_name,
    },
  };
}

const SELECT_WITH_PRODUCT = `
  SELECT orders.*, products.ai_title, products.image_paths, products.supplier_name
  FROM orders JOIN products ON products.id = orders.product_id
`;

function validateShipping({ shippingName, shippingAddress, shippingPhone }) {
  if (!shippingName?.trim() || !shippingAddress?.trim() || !shippingPhone?.trim()) {
    return 'Completează numele, adresa și telefonul de livrare.';
  }
  return null;
}

// Un produs e comandabil dacă: există, e publicat, furnizorul nu a oprit
// manual vânzarea, și (stocul e nespecificat/nelimitat SAU cantitatea
// cerută nu depășește ce a mai rămas).
function isOrderable(product, qty) {
  if (!product || product.status !== 'published') return false;
  if (product.stock_paused) return false;
  if (product.stock_quantity !== null && qty > product.stock_quantity) return false;
  return true;
}

// Creează efectiv rândurile din `orders` — folosită atât de checkout-ul
// direct (ramburs), cât și de confirmarea unei plăți Stripe reușite (card).
// Produsele inexistente/retrase/fără stoc/oprite între timp sunt ignorate,
// nu blochează restul comenzii — la fel ca înainte de introducerea plății
// cu cardul. Dacă produsul are stoc limitat, îl scade cu cantitatea
// comandată — altfel numărul afișat furnizorului ar rămâne decorativ.
function createOrders({ buyerId, items, shippingName, shippingAddress, shippingPhone, paymentMethod, stripeSessionId = null }) {
  const created = [];
  for (const { productId, quantity } of items) {
    const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(productId);
    const qty = Math.max(1, Number(quantity) || 1);
    if (!isOrderable(product, qty)) continue;
    const id = uuidv4();
    db.prepare(`
      INSERT INTO orders (id, buyer_id, product_id, quantity, price_at_order, status, shipping_name, shipping_address, shipping_phone, payment_method, stripe_session_id)
      VALUES (?, ?, ?, ?, ?, 'placed', ?, ?, ?, ?, ?)
    `).run(id, buyerId, productId, qty, product.raw_price, shippingName.trim(), shippingAddress.trim(), shippingPhone.trim(), paymentMethod, stripeSessionId);
    if (product.stock_quantity !== null) {
      db.prepare(`UPDATE products SET stock_quantity = MAX(0, stock_quantity - ?) WHERE id = ?`).run(qty, productId);
    }
    created.push(id);
  }
  return created;
}

// Coșul e ținut client-side (localStorage) — nu are sens un coș server-side
// pentru un prototip fără sesiune de cumpărare pe termen lung. Ruta asta e
// checkout-ul direct — DOAR pentru ramburs, unde nu e nevoie de confirmare
// externă de plată. Cardul trece prin /checkout-session + /confirm-session
// mai jos, ca să nu creăm o comandă înainte să știm sigur că a fost plătită.
router.post('/', requireAuth, requireRole('buyer'), (req, res) => {
  const { items, shippingName, shippingAddress, shippingPhone, paymentMethod } = req.body; // [{ productId, quantity }]
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Coșul e gol.' });
  }
  const shippingError = validateShipping(req.body);
  if (shippingError) return res.status(400).json({ error: shippingError });
  if (paymentMethod !== 'ramburs') {
    return res.status(400).json({ error: 'Plata cu cardul se procesează prin /checkout-session.' });
  }

  const created = createOrders({ buyerId: req.user.id, items, shippingName, shippingAddress, shippingPhone, paymentMethod: 'ramburs' });
  if (created.length === 0) {
    return res.status(400).json({ error: 'Niciun produs din coș nu mai e disponibil.' });
  }

  logActivity('order_placed', `${created.length} produs(e) · ramburs`, req.user.id);
  const rows = created.map((id) => db.prepare(`${SELECT_WITH_PRODUCT} WHERE orders.id = ?`).get(id));
  res.status(201).json(rows.map(serialize));
});

// Creează o sesiune Stripe Checkout (mod test) și întoarce URL-ul găzduit
// de Stripe — nu construim niciun formular de card noi, nu atingem
// niciodată date de card; Stripe rezolvă asta pe pagina lui. Nu creăm
// comanda aici — abia după ce /confirm-session verifică cu Stripe că
// plata a reușit efectiv.
router.post('/checkout-session', requireAuth, requireRole('buyer'), async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Plata cu cardul nu e configurată (lipsește STRIPE_SECRET_KEY).' });
  }
  const { items, shippingName, shippingAddress, shippingPhone } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Coșul e gol.' });
  }
  const shippingError = validateShipping(req.body);
  if (shippingError) return res.status(400).json({ error: shippingError });

  const lineItems = [];
  const validItems = [];
  for (const { productId, quantity } of items) {
    const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(productId);
    const qty = Math.max(1, Number(quantity) || 1);
    if (!isOrderable(product, qty)) continue;
    validItems.push({ productId, quantity: qty });
    lineItems.push({
      price_data: {
        currency: 'ron',
        product_data: { name: product.ai_title },
        unit_amount: Math.round(Number(product.raw_price || 0) * 100),
      },
      quantity: qty,
    });
  }
  if (validItems.length === 0) {
    return res.status(400).json({ error: 'Niciun produs din coș nu mai e disponibil.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${CLIENT_ORIGIN}/cos/succes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_ORIGIN}/cos`,
      // Metadata e sursa de adevăr la confirmare — sesiunea Stripe nu are
      // legătură cu tabelul nostru `orders` până nu confirmăm plata.
      metadata: {
        buyerId: req.user.id,
        shippingName: shippingName.trim(),
        shippingAddress: shippingAddress.trim(),
        shippingPhone: shippingPhone.trim(),
        items: JSON.stringify(validItems),
      },
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(502).json({ error: `Eroare Stripe: ${err.message}` });
  }
});

// Apelată de pagina de succes după redirect-ul de la Stripe — verifică
// DIRECT cu Stripe (nu are încredere doar în faptul că userul a ajuns pe
// success_url) că plata chiar a fost confirmată, înainte să creeze comanda.
// Idempotentă: dacă userul reîncarcă pagina de succes, nu duplichează
// comanda — verifică întâi dacă acest session_id a mai creat una.
router.get('/confirm-session', requireAuth, requireRole('buyer'), async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Plata cu cardul nu e configurată (lipsește STRIPE_SECRET_KEY).' });
  }
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id lipsă.' });

  const existing = db.prepare(`${SELECT_WITH_PRODUCT} WHERE orders.stripe_session_id = ?`).all(session_id);
  if (existing.length > 0) {
    return res.json(existing.map(serialize));
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id);
  } catch (err) {
    return res.status(502).json({ error: `Eroare Stripe: ${err.message}` });
  }

  if (session.payment_status !== 'paid') {
    return res.status(402).json({ error: 'Plata nu a fost confirmată de Stripe.' });
  }
  if (session.metadata.buyerId !== req.user.id) {
    return res.status(403).json({ error: 'Această sesiune de plată nu îți aparține.' });
  }

  const items = JSON.parse(session.metadata.items);
  const created = createOrders({
    buyerId: req.user.id,
    items,
    shippingName: session.metadata.shippingName,
    shippingAddress: session.metadata.shippingAddress,
    shippingPhone: session.metadata.shippingPhone,
    paymentMethod: 'card',
    stripeSessionId: session_id,
  });

  logActivity('order_placed', `${created.length} produs(e) · card (Stripe test)`, req.user.id);
  const rows = created.map((id) => db.prepare(`${SELECT_WITH_PRODUCT} WHERE orders.id = ?`).get(id));
  res.status(201).json(rows.map(serialize));
});

router.get('/mine', requireAuth, requireRole('buyer'), (req, res) => {
  const rows = db.prepare(`${SELECT_WITH_PRODUCT} WHERE orders.buyer_id = ? ORDER BY orders.created_at DESC`).all(req.user.id);
  res.json(rows.map(serialize));
});

export default router;
