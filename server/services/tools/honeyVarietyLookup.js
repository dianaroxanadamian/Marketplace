import { HONEY_VARIETIES } from '../../data/honeyVarieties.js';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Căutare simplă (fără embeddings, fără librării noi) — dar cu graniță de
// cuvânt (\b), nu doar .includes(): un substring naiv ar da fals-pozitiv
// real, ex. "tei" apare inclus în "proteine". Diacriticele nu sunt normalizate
// aici intenționat — comparăm exact cu variantele din `names`, care includ
// deja ambele forme (cu și fără diacritice), ca în restul aplicației.
function containsWholeWord(haystack, needle) {
  return new RegExp(`\\b${escapeRegex(needle)}\\b`, 'i').test(haystack);
}

/**
 * Caută dacă vreun soi cunoscut e menționat explicit în textul brut trimis
 * de furnizor (rawName + rawNotes). Întoarce info despre soi doar dacă
 * numele apare literal — nu ghicește soiul din nimic altceva (poză, preț etc).
 */
export function findVarietyInfo(rawName, rawNotes) {
  const haystack = `${rawName || ''} ${rawNotes || ''}`.trim();
  if (!haystack) return null;

  for (const variety of HONEY_VARIETIES) {
    if (variety.names.some((n) => containsWholeWord(haystack, n))) {
      return variety;
    }
  }
  return null;
}
