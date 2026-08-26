import express from 'express';
import db from '../db/database.js';
import { requireAuth, requireRole } from './auth.js';

const router = express.Router();

const EVENT_LABEL = {
  user_registered: 'Cont nou',
  user_login: 'Autentificare',
  order_placed: 'Comandă plasată',
};

router.use(requireAuth, requireRole('admin'));

// Sumar general — folosit pentru cardurile de sus ale dashboard-ului.
router.get('/stats', (req, res) => {
  const usersByRole = db.prepare('SELECT role, COUNT(*) as count FROM users GROUP BY role').all();
  const productsByStatus = db.prepare('SELECT status, COUNT(*) as count FROM products GROUP BY status').all();
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const revenue = db.prepare(`
    SELECT COALESCE(SUM(quantity * COALESCE(price_at_order, 0)), 0) as total FROM orders
  `).get().total;

  res.json({
    usersByRole: Object.fromEntries(usersByRole.map((r) => [r.role, r.count])),
    productsByStatus: Object.fromEntries(productsByStatus.map((r) => [r.status, r.count])),
    orderCount,
    revenue,
  });
});

// Cine e înregistrat — fără parole/hash-uri, evident.
router.get('/users', (req, res) => {
  const rows = db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(rows);
});

// Ce s-a cumpărat, de la cine, ce produs.
router.get('/orders', (req, res) => {
  const rows = db.prepare(`
    SELECT orders.*, users.name as buyer_name, users.email as buyer_email, products.ai_title as product_title
    FROM orders
    JOIN users ON users.id = orders.buyer_id
    JOIN products ON products.id = orders.product_id
    ORDER BY orders.created_at DESC
  `).all();
  res.json(rows);
});

// Jurnal de activitate — evenimente de business, nu tracking de pageview-uri
// (vezi comentariul din database.js). Suficient pentru "ce s-a întâmplat pe
// site în general", fără să pretindă a fi un sistem de analytics complet.
router.get('/activity', (req, res) => {
  const rows = db.prepare(`
    SELECT activity_log.*, users.name as user_name
    FROM activity_log
    LEFT JOIN users ON users.id = activity_log.user_id
    ORDER BY activity_log.created_at DESC
    LIMIT 100
  `).all();
  res.json(rows.map((r) => ({ ...r, label: EVENT_LABEL[r.event] || r.event })));
});

export default router;
