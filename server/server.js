import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import productsRouter from './routes/products.js';
import authRouter from './routes/auth.js';
import ordersRouter from './routes/orders.js';
import adminRouter from './routes/admin.js';
import db from './db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Acceptă originea explicită din .env, plus orice IP din rețeaua locală
// (192.168.x.x / 10.x.x.x / 172.16-31.x.x), pe portul clientului — ca
// aplicația să funcționeze la fel accesată de pe un telefon din aceeași
// rețea WiFi, nu doar de pe acest PC (localhost).
const LOCAL_NETWORK_ORIGIN = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):5173$/;
function corsOrigin(origin, callback) {
  if (!origin || origin === CLIENT_ORIGIN || LOCAL_NETWORK_ORIGIN.test(origin)) return callback(null, true);
  callback(new Error('Origine CORS neacceptată'));
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('\n⚠️  ANTHROPIC_API_KEY nu este setat în server/.env — analiza AI va eșua.\n   Copiază .env.example în .env și adaugă cheia ta.\n');
}

// Fără fallback hardcodat aici, intenționat — un secret vizibil în sursă ar
// permite oricui a citit codul să falsifice cookie-uri de sesiune semnate.
// Generat automat la primul start dacă lipsește din .env (vezi mai jos).
if (!process.env.SESSION_SECRET) {
  const generated = crypto.randomBytes(32).toString('hex');
  fs.appendFileSync(path.join(__dirname, '.env'), `\nSESSION_SECRET=${generated}\n`);
  process.env.SESSION_SECRET = generated;
  console.log('\n🔑 SESSION_SECRET nu era setat — am generat unul nou și l-am salvat în server/.env\n');
}

// Cont admin implicit — prototip local, fără flux de invitare/promovare.
// Creat o singură dată, la prima pornire (idempotent, ca migrațiile din db).
{
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!existing) {
    const email = process.env.ADMIN_EMAIL || 'admin@fagure.ro';
    // Fără parolă implicită hardcodată ("admin123" era ghicibilă din sursă) —
    // generăm una random dacă lipsește din .env, la fel ca SESSION_SECRET.
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '');
    db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), email, bcrypt.hashSync(password, 10), 'Admin', 'admin');
    console.log(`\n👤 Cont admin creat: ${email} / ${password} (schimbă-l din .env — ADMIN_EMAIL / ADMIN_PASSWORD)\n`);
  }
}

app.use(cors({ credentials: true, origin: corsOrigin }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/products', productsRouter);
app.use('/api/auth', authRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Error handler central, ULTIMUL middleware (4 argumente — semnătura pe care
// Express o recunoaște special ca handler de erori). Fără el, orice eroare
// necontrolată (fișier respins de Multer, JSON malformat trimis de client,
// tip greșit legat într-un parametru SQLite) cădea pe pagina HTML implicită
// a Express, cu stack trace complet și căi absolute de pe disc expuse
// direct clientului — găsit live, testat cu 3 cazuri reale, nu ipotetic.
// Mesaje românești, clare, fără detalii tehnice — cine dă peste ele într-un
// demo vede un motiv, nu un stacktrace.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // JSON malformat trimis de client (express.json() marchează eroarea de parsare)
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Cererea trimisă nu e validă — verifică formatul datelor.' });
  }

  // Erori Multer (fișier prea mare, prea multe fișiere etc.)
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'Fișierul e prea mare (maxim 8MB per poză).',
      LIMIT_FILE_COUNT: 'Ai încărcat prea multe poze (maxim 5).',
      LIMIT_UNEXPECTED_FILE: 'Fișierul încărcat nu e valid.',
    };
    return res.status(400).json({ error: messages[err.code] || 'Fișierul încărcat nu e valid.' });
  }

  // Tip de fișier respins explicit de fileFilter (products.js) — mesajul e
  // deja clar, în română, scris pentru utilizator, nu doar refolosit ca atare.
  if (/Format neacceptat/.test(err.message || '')) {
    return res.status(400).json({ error: err.message });
  }

  // Tip greșit legat într-un parametru SQLite (ex: un obiect trimis unde se
  // aștepta text/număr) — TypeError-ul brut al node:sqlite e tehnic, nu
  // pentru utilizator final.
  if (err instanceof TypeError && /bound to SQLite parameter/.test(err.message || '')) {
    return res.status(400).json({ error: 'Datele trimise nu sunt valide — verifică formatul câmpurilor.' });
  }

  console.error('Eroare neașteptată:', err);
  res.status(500).json({ error: 'A apărut o eroare neașteptată pe server. Încearcă din nou.' });
});

app.listen(PORT, () => {
  console.log(`🍯 Honey Marketplace API rulează pe http://localhost:${PORT}`);
});
