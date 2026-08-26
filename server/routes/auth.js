import express from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db, { logActivity } from '../db/database.js';

const router = express.Router();

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

// Orice request autentificat prin sesiune trece de aici înainte de rutele
// protejate — atașează req.user, ca rutele să nu mai citească din nou DB.
export function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Trebuie să fii autentificat.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Contul nu mai există.' });
  req.user = user;
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: `Acțiune permisă doar rolului "${role}".` });
    next();
  };
}

router.post('/register', (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, parolă și nume sunt obligatorii.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Parola trebuie să aibă cel puțin 6 caractere.' });
  }
  const finalRole = role === 'supplier' ? 'supplier' : 'buyer'; // admin nu se poate auto-înregistra

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) return res.status(409).json({ error: 'Există deja un cont cu acest email.' });

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
    .run(id, email.trim().toLowerCase(), passwordHash, name.trim(), finalRole);
  logActivity('user_registered', `${finalRole}: ${name.trim()}`, id);

  req.session.userId = id;
  req.session.role = finalRole;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json(publicUser(user));
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Email sau parolă greșită.' });
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  logActivity('user_login', user.email, user.id);
  res.json(publicUser(user));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.status(204).send());
});

router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.json(null);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.json(null);
  res.json(publicUser(user));
});

export default router;
