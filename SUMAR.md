# Fagure — sumar de o pagină

*(strict din `README.md` și `DECISIONS.md`, stare curentă a documentelor)*

## 1. Ce face aplicația

Prototip local de marketplace de miere: furnizorul încarcă 2-5 poze + informații brute, un modul AI (Claude Vision) generează automat titlu, descriere, categorie și caracteristici, furnizorul verifică/editează, apoi publică. Are conturi reale (furnizor/cumpărător/admin), coș + comandă, și panou de admin cu statistici.

## 2. Arhitectura AI reală actuală

3 straturi combinate în `server/services/`:
- **Generator** (`runGenerator`) — pattern **Agents** (nu Orchestrator-Workers): buclă de tool-calling, max 4 runde, cu **3 tool-uri**: `cauta_produse_similare` (RAG lexical TF-IDF peste catalog), `obtine_categorii_valide` (lista fixă de 9 categorii), `obtine_info_soi` (RAG de soiuri — 8 soiuri românești, folosit DOAR ca generalizare "de regulă...", niciodată ca fapt cert).
- **Evaluator-Optimizer** (`runEvaluator` + buclă, max 2 runde de rafinare) — 7 criterii (titlu, categorie, nimic inventat, non-repetiție, nume de brand inventat, detalii senzoriale ca fapte certe, ambalaj/medical în afara secțiunilor permise din descriere). Pozele se trimit la evaluator doar condiționat. Ultima rescriere e reevaluată și ea.
- **Validare programatică, fără AI** (`validateListing`) — regex determinist pe tipare de formă cunoscute; marchează `needsManualReview` dacă validarea eșuează SAU evaluatorul n-a aprobat niciodată draftul.

## 3. Cele mai importante decizii tehnice

- **`node:sqlite`, nu `better-sqlite3`** — evită compilarea nativă (lipsă Visual Studio Build Tools).
- **Claude Vision, nu model de viziune local** — calitate net superioară a textului generat; logica AI izolată în `services/`+`data/`, înlocuibilă fără să atingă restul aplicației.
- **Categorii fixe, nu libere** — consistență pentru filtrare pe marketplace, verificabile prin tool + validare finală în cod.
- **SQLite, nu JSON/MySQL** — interogări reale + integritate, fără friction-ul unui server separat.

## 4. Cele mai importante bug-uri găsite și reparate

1. **Model Claude invalid** (`claude-sonnet-4-6`) → corectat la `claude-sonnet-5`.
2. **Gap de autorizare server-side** — editare/publicare/ștergere verificate doar în UI, oricine putea modifica produsul altui furnizor prin API direct → `requireOwner` server-side.
3. **`SESSION_SECRET` și parolă de admin hardcodate** — sesiuni falsificabile de oricine citea sursa → generate random, salvate doar în `.env`.
4. **Buget de tokeni insuficient, de 3 ori** — thinking adaptiv al `claude-sonnet-5` consumă din același buget ca `max_tokens`; JSON tăiat la mijloc de fiecare dată când promptul/output-ul a crescut → bugete mărite (evaluator 400→1500→2500, generator 1200→4000→5000→7000).
5. **Draftul final din bucla evaluator-optimizer nu era reevaluat** — a permis o halucinație reală (nume de producător inventat) să ajungă publicată → ultima rescriere e acum reevaluată și ea.
6. **Derapare spre ton medical** ("hipoalergenic", "efect calmant, folosită la răceli") într-un câmp vechi, neauditat la extinderea RAG-ului de soiuri — prinsă de evaluator, nu de regex-ul propriu de verificare → reformulat, regex de verificare extins.
7. **Gap de autorizare pe `GET /products/:id`, găsit la o analiză finală** — produsele nepublicate (draft/pending_review) erau vizibile oricui cunoștea id-ul, autentificat sau nu; frontend-ul public nu era afectat, doar API-ul direct → ruta întoarce acum 404 pentru non-proprietar/non-admin.

## 5. Ce a rămas deliberat în afara scopului

Storage local pentru poze (nu S3), coș și checkout informative (fără plăți reale), fără notificări email/push, fără fallback la model local dacă lipsește cheia API, fără exemple few-shot suficiente inițial (adăugate ulterior), fără RAG semantic (embeddings) — TF-IDF/lookup lexical ales explicit pentru simplitate.

## 6. Unde s-a extins scopul inițial

**Autentificare reală** (furnizor/cumpărător/admin), **coș** și **panou de admin** — inițial decise explicit ca fiind în afara scopului (riscau să dilueze evaluarea pipeline-ului AI). Revenit asupra deciziei pentru o demonstrație mai completă a fluxului "de la cont până la cumpărare" — extindere care a mărit suprafața de securitate testată (parole, sesiuni, autorizare pe roluri), documentată separat de fluxul central de AI.
