import db from '../../db/database.js';

// TF-IDF minimal, scris de mână, fără dependințe externe (nu embeddings +
// vector DB, cum arată RAG-ul "clasic" din curs) — alegere deliberată pentru
// un catalog local mic: fiecare produs devine un vector de cuvinte ponderate,
// iar căutarea calculează similaritatea cosinus între interogare și fiecare
// produs existent. Compromis: nu prinde sinonime/parafrazări (căutare
// lexicală, nu semantică) — potrivit pentru RAG demonstrativ, nu producție.

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // scoate diacritice (ă, î, ș...)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function buildTf(tokens) {
  const tf = {};
  tokens.forEach((t) => { tf[t] = (tf[t] || 0) + 1; });
  const len = tokens.length || 1;
  Object.keys(tf).forEach((k) => { tf[k] = tf[k] / len; });
  return tf;
}

function cosineSim(vecA, vecB) {
  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dot = 0, magA = 0, magB = 0;
  keys.forEach((k) => {
    const a = vecA[k] || 0, b = vecB[k] || 0;
    dot += a * b; magA += a * a; magB += b * b;
  });
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Caută produse deja existente în marketplace similare cu o interogare text.
 * Folosit ca "tool" de către agentul AI, ca sursă de RAG: îl ajută să scrie
 * într-un ton consistent cu restul catalogului și să nu repete titluri.
 */
export function searchSimilarProducts(query, topK = 3) {
  const rows = db.prepare(`
    SELECT id, ai_title, ai_description, ai_category, ai_characteristics
    FROM products WHERE ai_title IS NOT NULL
  `).all();

  if (rows.length === 0) return [];

  const corpus = rows.map((r) => ({
    row: r,
    tokens: tokenize(`${r.ai_title} ${r.ai_description} ${r.ai_category}`),
  }));

  // IDF pe tot corpusul existent
  const df = {};
  corpus.forEach(({ tokens }) => {
    new Set(tokens).forEach((t) => { df[t] = (df[t] || 0) + 1; });
  });
  const idf = {};
  Object.keys(df).forEach((t) => { idf[t] = Math.log((1 + corpus.length) / (1 + df[t])) + 1; });

  const weight = (tf) => {
    const v = {};
    Object.keys(tf).forEach((t) => { v[t] = tf[t] * (idf[t] || 1); });
    return v;
  };

  const queryVec = weight(buildTf(tokenize(query)));

  const scored = corpus.map(({ row, tokens }) => ({
    row,
    score: cosineSim(queryVec, weight(buildTf(tokens))),
  }));

  return scored
    .filter((s) => s.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => ({
      title: s.row.ai_title,
      category: s.row.ai_category,
      characteristics: JSON.parse(s.row.ai_characteristics || '[]'),
      similarity: Number(s.score.toFixed(3)),
    }));
}
