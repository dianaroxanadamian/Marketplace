import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import { toolDefinitions, executeTool } from './toolRegistry.js';
import { CATEGORIES } from './categories.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export { CATEGORIES };

function guessMediaType(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); }
  catch { throw new Error('Răspunsul AI nu a putut fi interpretat ca JSON: ' + cleaned.slice(0, 200)); }
}

/**
 * PASUL 1 — GENERATOR, pattern-ul "Agents" (agent cu tool-calling, într-o
 * buclă): Claude primește poza + contextul brut și poate apela tool-uri (RAG
 * peste catalogul existent, lista de categorii) înainte să scrie draftul
 * final. Bucla `for` de mai jos e bucla agentică propriu-zisă: continuăm să
 * trimitem rezultatele tool-urilor înapoi la model până când acesta decide
 * că a strâns destule informații și răspunde cu text final (fără alt
 * tool_use). NU e pattern-ul Orchestrator-Workers (acela presupune
 * descompunere dinamică în subtask-uri + workeri paraleli + agregare —
 * nimic din toate astea nu se întâmplă aici, un singur agent secvențial).
 */
async function runGenerator({ images, rawName, rawPrice, rawQuantity, rawNotes, feedback }, log) {
  // Data curentă REALĂ a serverului, nu presupunerea implicită a modelului
  // despre "azi" (care tinde spre data limită de antrenare) — bug real,
  // găsit live: fără asta, modelul marca ani corecți, curenți (ex: 2026)
  // ca fiind "posibil eronați, an viitor" în confidenceNotes, doar pentru
  // că depășeau ce "știa" din antrenare. Afectează atât generatorul
  // (scrie confidenceNotes), cât și evaluatorul (verifică plauzibilitatea).
  const todayRo = new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  const systemPrompt = `Ești un agent care pregătește produse apicole (miere, propolis, ceară, polen) pentru un marketplace online.
Data curentă reală este ${todayRo} — folosește asta ca referință pentru "azi", NU presupunerea ta implicită din antrenare. Un an ca 2026 sau o lună recentă menționată de furnizor NU sunt "posibil eronate" sau "an viitor" doar pentru că depășesc ce știai dinainte — sunt perfect normale dacă sunt înainte de ${todayRo} sau apropiate de ea. Marchează o dată ca suspectă DOAR dacă e clar imposibilă (ex: o dată mult după ${todayRo}, sau o incoerență reală, nu doar "nu era în datele mele de antrenare").
Ai la dispoziție tool-uri — folosește-le înainte să răspunzi final, nu ghici informații pe care le poți verifica.

Categorii permise (poți verifica lista exactă și cu tool-ul obtine_categorii_valide):
${CATEGORIES.map((c) => `- ${c}`).join('\n')}

REGULĂ STRICTĂ, cea mai importantă din acest prompt — nu inventa NIMIC ce nu
poate fi verificat din una din cele 2 surse permise:
1. informațiile brute trimise de furnizor (nume, preț, cantitate, note) sau
2. ce vezi chiar tu, direct, în poze.
Asta include, explicit: NU inventa un nume de producător/stupină/brand dacă nu
apare deja în informațiile brute — dacă furnizorul n-a specificat un nume,
titlul/descrierea NU trebuie să conțină unul, folosește doar soiul/categoria.
NU inventa detalii senzoriale (gust, comportament la cristalizare, textură)
ca fapte certe dacă nu apar în notele furnizorului și nu se văd clar în poză
— dacă vrei să menționezi o caracteristică tipică a soiului, pe care n-o poți
confirma din context, formuleaz-o explicit ca generalizare ("de regulă,
mierea de salcâm cristalizează greu"), nu ca observație verificată, și
menționează asta în confidenceNotes. Tool-ul cauta_produse_similare e sursă
de TON/VOCABULAR consistent cu restul catalogului, NU sursă de fapte noi
despre produsul curent — nu prelua nume sau detalii din produsele similare
ca și cum ar aparține produsului de acum.

REGULĂ DE CONFIDENȚIALITATE — dacă pe etichetă, vizibilă în poză, apar date
de contact personale (nume de persoană, număr de telefon, adresă), NU le
include ca o "caracteristică" separată în listă și NU le evidenția în
descriere ca pe un avantaj al produsului ("vine cu contactul direct al
producătorului" etc.). Poți menționa generic, dacă e relevant, "etichetă
proprie a producătorului", fără să scoți în evidență că eticheta conține
date de contact vizibile — anunțul nu trebuie să amplifice expunerea unor
date personale reale ale furnizorului, chiar dacă apar clar în fotografie.

STIL DE SCRIERE — titlul și descrierea trebuie să sune a anunț scris de un
om, nu a listă tehnică de specificații:
- Titlul e cald, dar simplu — nu înșiruie caracteristici separate prin
  liniuță ca pe o etichetă tehnică. Ex bun: "Polen natural de la stupină -
  granule aurii, 200g". Ex de evitat: "Polen granule - supliment alimentar
  natural, 200g".
- Descrierea are 2-3 propoziții naturale, nu o listă de fapte înșirate una
  după alta. Ancorează afirmațiile vizuale în sursa lor ("așa cum se vede
  în poze", "cules și lăsat să-și păstreze culoarea"), nu le enunța sec.
- "characteristics" rămâne concis, dar nu repeta cuvânt cu cuvânt ce ai
  spus deja în descriere — completează, nu dubla informația.
- INTERZIS peste tot, în titlu și descriere: termenul "supliment alimentar"
  — e o categorie legal reglementată în UE pentru etichetare alimentară, nu
  o poți atribui fără conformare. Folosește formulări neutre: "produs
  apicol", "polen natural", "produs natural de stup", etc.
- Formulări gen "din stupină proprie", "vine direct din stupină", "de la
  apicultorul nostru" implică EXPLICIT că furnizorul e apicultor — folosește-le
  DOAR dacă furnizorul a menționat asta explicit în rawName/rawNotes (ex:
  "din stupina proprie", "apicultor de generații"). Nu presupune implicit
  că orice furnizor e apicultor — poate fi la fel de bine un revânzător, iar
  o afirmație falsă despre proveniență ar fi exact genul de lucru inventat
  interzis de regula strictă de mai sus. Fără mențiune explicită a stupinei/
  apiculturii în informațiile brute, folosește formulări neutre ("acest
  polen natural, în granule aurii...") care nu presupun nimic despre cine e
  furnizorul.

Dacă apelezi obtine_info_soi și primești un rezultat, folosește informația
DOAR ca generalizare tipică a soiului (ex: "mierea de salcâm este de obicei
limpede și cristalizează lent"), NICIODATĂ ca fapt cert despre produsul din
poze (ex: NU "acest borcan conține miere cristalizată lent" dacă nu se vede
clar în poză). NU apela acest tool dacă furnizorul nu a menționat niciun soi
în rawName/rawNotes — nu ghici soiul din culoarea observată în imagine.

STRUCTURA DESCRIERII — cerută explicit, până la 3 părți, ca text continuu
în ACELAȘI câmp "description" din JSON (nu câmpuri separate), paragrafe
despărțite prin linie goală (\\n\\n):

1. Paragraful principal (OBLIGATORIU) — 2-3 propoziții calde despre
   PRODUS (mierea/polenul/propolisul în sine — soi, gust, culoare,
   consistență), NICIODATĂ despre ambalaj. Interzis aici: "borcan de
   sticlă", "capac auriu", "etichetă cu design...", orice descriere a
   recipientului — asta aparține DOAR caracteristicilor (vezi mai jos).
   Ancorarea vizuală ("așa cum se vede în poze") rămâne folosită DOAR
   pentru culoarea/consistența PRODUSULUI, nu pentru ambalaj.
2. "Despre acest soi:" (OPȚIONAL — DOAR dacă ai apelat obtine_info_soi și
   ai primit un rezultat găsit) — 1-2 propoziții cu generalizări
   hedge-uite despre soi ("de regulă, mierea de tei..."), preluate din
   rezultatul tool-ului. Dacă tool-ul n-a fost apelat sau n-a găsit
   soiul, OMITE complet secțiunea — nu inventa.
3. "Cum se folosește:" (OPȚIONAL) — STRICT utilizări culinare (în ceai,
   pe pâine, în deserturi, în marinate), preluate din câmpul
   culinaryUses întors de obtine_info_soi, dacă există. INTERZIS FERM,
   chiar reformulat subtil: beneficii de sănătate, efecte terapeutice,
   "remediu natural", recomandări medicale, valori nutriționale. Dacă nu
   ai o sursă reală pentru utilizări culinare (soi necunoscut, sau un
   produs care nu se consumă ca atare — propolis, ceară de albine),
   OMITE complet secțiunea, nu inventa utilizări generice.

"characteristics" — cel mult UN singur element poate descrie ambalajul
(ex: "Ambalat în borcan de 500g"); restul elementelor descriu produsul
(culoare, textură, aromă, fapte de soi hedge-uite) — nu dubla ce ai scris
deja în descriere. Dacă un element e o generalizare de soi (nu observație
directă), hedge-uiește-l DOAR cu prefixul "De regulă, ..." (ex: "De
regulă, cristalizează greu") — NU adăuga clarificări suplimentare în
paranteze după el (ex: NU "(generalizare de soi, neconfirmată din poză)")
— e informație deja transmisă prin confidenceNotes, repetarea ei per
caracteristică aglomerează lista fără rost.

Exemplu — context brut normal, cu informații suficiente, care ilustrează
tonul cald cerut mai sus (fără mențiune de stupină, pentru că furnizorul nu
a menționat-o în rawNotes):

Input:
rawName: "polen"
rawPrice: "25"
rawQuantity: "200g"
rawNotes: ""
Poze: pungă/borcan cu granule de polen aurii-portocalii, fără etichetă cu nume de producător

Output corect:
{
  "title": "Polen natural, granule aurii - 200g",
  "category": "Polen",
  "description": "Polenul acesta se prezintă în granule aurii, așa cum se vede în poze, ambalat la 200g. E un produs apicol simplu, fără adaosuri, gata de consum.",
  "characteristics": [
    "Granule aurii-portocalii, culoare uniformă",
    "Ambalat la 200g"
  ],
  "confidenceNotes": ""
}

Observă: titlul și descrierea sună natural, nu ca o listă de specificații;
NU apare "supliment alimentar"; NU apare "din stupină" pentru că rawNotes
nu menționează apicultura furnizorului — dacă rawNotes ar fi conținut, de
exemplu, "din stupina proprie", descrierea ar fi putut spune "acest polen
vine direct din stupină", dar nu implicit, fără acea mențiune.

Exemplu — soi cunoscut, obtine_info_soi apelat și găsit, ilustrează
structura nouă de 3 părți a descrierii:

Input:
rawName: "miere de tei"
rawPrice: "30"
rawQuantity: "borcan 600g"
rawNotes: "recoltata in iulie 2026"
Poze: borcan cu miere galbenă spre chihlimbarie, capac auriu, etichetă simplă
obtine_info_soi("tei") → găsit, culinaryUses: ["în ceai (asociere tradițională)", "cu lămâie", "în prăjituri cu miere"]

Output corect:
{
  "title": "Miere de tei, aromă intensă - borcan 600g",
  "category": "Miere de tei",
  "description": "Miere de tei din recolta lunii iulie 2026, cu o culoare galbenă spre chihlimbarie, așa cum se vede în poze. Aroma e puternică, ușor mentolată, specifică acestui soi.\\n\\nDespre acest soi: de regulă, mierea de tei cristalizează moderat, cu granule fine, și are o aromă intensă, ușor balsamică.\\n\\nCum se folosește: tradițional în ceai, cu lămâie, sau ca îndulcitor natural în prăjituri cu miere.",
  "characteristics": [
    "Ambalată în borcan de 600g",
    "Culoare galbenă spre chihlimbarie",
    "Aromă puternică, ușor mentolată"
  ],
  "confidenceNotes": ""
}

Observă: descrierea NU menționează capacul auriu sau eticheta (acelea rămân
în afara descrierii, nu apar nici în characteristics aici, pentru că nu
adaugă informație despre produs); "Despre acest soi" și "Cum se folosește"
apar DOAR pentru că obtine_info_soi a fost apelat și a găsit "tei" — pentru
un soi nerecunoscut sau un produs necunoscut (ex: propolis), ambele
secțiuni s-ar omite complet, nu s-ar inventa conținut generic.

Exemplu — context brut aproape gol (furnizorul nu a completat date):

Input:
rawName: ""
rawPrice: ""
rawQuantity: ""
rawNotes: ""
Poze: borcan de sticlă cu capac, conținut lichid ambru, fără etichetă lizibilă

Output corect:
{
  "title": "Miere naturală - de completat de furnizor",
  "category": "Alte produse apicole",
  "description": "Produs ambalat într-un borcan de sticlă cu capac. Furnizorul nu a transmis informații despre soi, cantitate sau preț, iar eticheta nu poate fi citită din fotografii. Este necesară completarea manuală a acestor date înainte de publicare.",
  "characteristics": [
    "Ambalat în borcan de sticlă cu capac",
    "Conținut lichid, culoare ambră"
  ],
  "confidenceNotes": "Soi, cantitate și preț nespecificate de furnizor; eticheta ilizibilă în fotografii."
}

Reguli de urmat OBLIGATORIU în acest caz:
- Titlul NU conține niciodată paranteze cu mesaje de sistem precum "(detalii incomplete)", "(nespecificat)" — e un titlu vandabil, curat, chiar dacă informația e minimă
- O lipsă de informație (preț/cantitate/soi nespecificate) NU e o caracteristică a produsului — nu apare niciodată în lista "characteristics", ci EXCLUSIV în "confidenceNotes"
- "characteristics" conține DOAR ce se poate confirma vizual din poze (ambalaj, culoare, formă), niciodată deducții sau presupuneri

Când ai destule informații, răspunde DOAR cu un obiect JSON valid, fără text în plus, fără markdown, cu exact această structură:
{
  "title": "titlu scurt, atractiv, în română, max 60 caractere",
  "description": "1-3 paragrafe separate prin \\n\\n: paragraful principal (obligatoriu, despre produs, NU ambalaj) + opțional 'Despre acest soi:' (doar dacă obtine_info_soi a găsit ceva) + opțional 'Cum se folosește:' (strict culinar, fără beneficii de sănătate) — ton cald și autentic, nu listă de specificații",
  "category": "una dintre categoriile permise, EXACT cum e scrisă în listă",
  "characteristics": ["3-6 caracteristici scurte relevante"],
  "confidenceNotes": "o propoziție scurtă despre ce nu ai putut determina cu certitudine doar din poză, sau string gol"
}`;

  const userText = `Informații furnizate de furnizor:
- Nume brut: ${rawName || '(nespecificat)'}
- Preț: ${rawPrice ? rawPrice + ' RON' : '(nespecificat)'}
- Cantitate/gramaj: ${rawQuantity || '(nespecificat)'}
- Note suplimentare: ${rawNotes || '(niciuna)'}
${feedback ? `\nFEEDBACK de la evaluator pe o încercare anterioară — corectează asta: ${feedback}` : ''}`;

  const messages = [
    {
      role: 'user',
      content: [
        // TOATE pozele, în același apel — nu doar prima — ca analiza să
        // acopere unghiuri/detalii diferite (etichetă, textură, ambalaj).
        ...images.map(({ base64Image, mediaType }) => ({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64Image },
        })),
        { type: 'text', text: userText },
      ],
    },
  ];

  const MAX_TOOL_ROUNDS = 4;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      // claude-sonnet-5 rulează adaptive thinking implicit (nu poate fi
      // omis) — thinking-ul consumă din ACELAȘI buget de max_tokens ca
      // răspunsul final. La 1200 (apoi 2500, apoi 5000), thinking-ul îl
      // epuiza parțial sau complet (stop_reason: "max_tokens", JSON tăiat
      // la mijloc sau absent) — bug real, prins la testare live, reprodus
      // de 3 ori la valori diferite, ultima oară după extinderea descrierii
      // la 3 paragrafe (structură nouă, output mai lung per produs). Nu
      // dezactivăm thinking (risc documentat: modelul poate scrie apelul de
      // tool ca text vizibil în loc de tool_use, ceea ce ar rupe bucla
      // agentică de mai jos) — doar lărgim bugetul din nou.
      max_tokens: 7000,
      system: systemPrompt,
      tools: toolDefinitions,
      messages,
    });

    const toolUses = response.content.filter((b) => b.type === 'tool_use');

    if (toolUses.length === 0) {
      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock) throw new Error('AI nu a returnat text final.');
      return extractJson(textBlock.text);
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = toolUses.map((tu) => {
      log.push({ step: 'tool_call', tool: tu.name, input: tu.input });
      const result = executeTool(tu.name, tu.input);
      log.push({ step: 'tool_result', tool: tu.name, result });
      return {
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      };
    });

    messages.push({ role: 'user', content: toolResults });
  }

  throw new Error('Agentul a depășit numărul maxim de pași fără să ajungă la un rezultat final.');
}

// Gating pentru trimiterea pozelor la evaluator: doar dacă draftul ÎNSUȘI
// face vreo afirmație verificabilă vizual (culoare, etichetă, ambalaj,
// aspect, textură) — dacă draftul rămâne complet generic/text, evaluatorul
// n-are ce verifica în poze, deci nu le trimitem (cost mai mic în cazul comun).
const VISUAL_CLAIM_PATTERN = /etichet|culoare|ambalaj|borcan|capac|aspect|textur[ăa]|se observ|se vede|fotografi|imagine|poz[ăa]/i;

function draftMakesVisualClaims(draft) {
  const text = [draft.title, draft.description, ...(draft.characteristics || [])].join(' ');
  return VISUAL_CLAIM_PATTERN.test(text);
}

/**
 * PASUL 2 — EVALUATOR (pattern Evaluator-Optimizer).
 * Un al doilea apel, independent, care verifică draftul generat de agent
 * față de criterii clare și decide dacă e publicabil sau trebuie refăcut.
 */
async function runEvaluator(draft, rawInfo, log, images) {
  // Bug real, găsit live: evaluatorul nu vedea niciodată pozele, deci nu
  // putea distinge "generatorul a citit corect eticheta din poză" de
  // "generatorul a inventat". A respins fals o citire corectă a etichetei
  // ("Polifloră de Munte"), confirmată manual pe poza reală. Fix: trimitem
  // pozele DOAR când draftul chiar face o afirmație vizuală de verificat
  // (vezi draftMakesVisualClaims) — nu la fiecare rundă necondiționat, ca
  // să nu triplăm costul de tokeni pe cazurile unde n-are rost.
  const includeImages = Boolean(images?.length) && draftMakesVisualClaims(draft);

  const todayRo = new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  const prompt = `Evaluezi un anunț generat de AI pentru un marketplace de miere, ÎNAINTE să fie arătat furnizorului.
Data curentă reală este ${todayRo} — dacă draftul menționează un an/lună care pare "din viitor" doar față de ce știai tu din antrenare, dar e de fapt înainte de ${todayRo} sau apropiat de ea, NU e o eroare, nu cere corectură pentru asta.
${includeImages ? '\nAi atașate mai jos pozele reale ale produsului — verifică afirmațiile vizuale din draft direct față de ce se vede în poze, nu doar față de contextul brut text. O afirmație vizuală confirmată de poză NU e o halucinație, chiar dacă nu apare în rawNotes.\n' : ''}
Anunț generat:
${JSON.stringify(draft, null, 2)}

Context brut furnizat de furnizor: ${JSON.stringify(rawInfo)}

Criterii de verificare:
1. Titlul are sub 60 de caractere și nu e generic ("Miere bună" nu e ok).
2. Categoria e EXACT una din: ${CATEGORIES.join(', ')}.
3. Descrierea nu inventează detalii verificabile (ex: certificări, premii) care nu apar în contextul brut.
4. Caracteristicile sunt relevante și nu se repetă cu titlul/descrierea.
5. NU apare niciun nume de producător/stupină/brand în titlu, descriere sau
   caracteristici decât dacă acel nume exact apare deja în contextul brut
   (rawName/rawNotes) SAU e vizibil chiar tu pe etichetă în poza atașată —
   verifică asta explicit, cuvânt cu cuvânt, e cea mai frecventă halucinație
   găsită până acum la acest agent.
6. Detaliile senzoriale/vizuale (gust, culoare, comportament la cristalizare,
   textură) nu sunt prezentate ca fapte certe dacă nu apar în contextul brut
   ȘI nu se confirmă în poza atașată (dacă e atașată) — dacă sunt generalizări
   tipice ale soiului, trebuie formulate explicit ca atare.
7. Paragraful principal al descrierii NU descrie ambalajul (borcan, capac,
   etichetă) — asta aparține cel mult unei singure linii în characteristics,
   nu descrierii. Dacă apar secțiunile "Despre acest soi:" sau "Cum se
   folosește:", verifică STRICT: prima e hedge-uită explicit ("de regulă"),
   niciodată fapt cert; a doua conține DOAR utilizări culinare (ceai, pâine,
   deserturi, marinate) — respinge orice urmă de beneficiu de sănătate,
   efect terapeutic, "remediu", recomandare medicală sau valoare
   nutrițională, chiar formulată subtil sau indirect.

Răspunde DOAR cu JSON: {"approved": true/false, "feedback": "ce trebuie corectat, sau string gol dacă e aprobat"}`;

  const content = includeImages
    ? [
        ...images.map(({ base64Image, mediaType }) => ({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64Image },
        })),
        { type: 'text', text: prompt },
      ]
    : prompt;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    // Vezi comentariul din runGenerator — thinking-ul adaptiv (implicit pe
    // claude-sonnet-5) epuiza bugetul de 400 fără să mai ajungă la JSON-ul
    // final (stop_reason: "max_tokens", content: doar "thinking"). Reprodus
    // A DOUA OARĂ, live, după ce am adăugat criteriile 5-6 (nume inventat +
    // detalii senzoriale) — promptul de evaluare a crescut, 1500 nu mai
    // ajungea, JSON-ul verdictului ieșea tăiat la mijloc. Lecția reală: de
    // fiecare dată când crește promptul (mai multe criterii, exemple etc.),
    // bugetul de tokeni trebuie re-verificat, nu presupus suficient la nesfârșit.
    max_tokens: 2500,
    messages: [{ role: 'user', content }],
  });

  // Instrumentare opt-in — pusă temporar fără gate ca să măsurăm costul real
  // al includerii pozelor (rezultat confirmat și documentat în DECISIONS.md),
  // acum înapoi în spatele unui flag explicit, nu activă implicit.
  if (process.env.DEBUG_EVALUATOR_COST) {
    console.log(`[evaluator-cost] includeImages=${includeImages} input_tokens=${response.usage?.input_tokens} output_tokens=${response.usage?.output_tokens}`);
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const verdict = extractJson(textBlock.text);
  log.push({ step: 'evaluator', verdict, imagesIncluded: includeImages });
  return verdict;
}

// Plasă de siguranță programatică, FĂRĂ AI — rulează după ce evaluatorul a
// aprobat (sau bugetul de runde s-a epuizat), ca ultim control înainte de
// pending_review. Nu înlocuiește evaluatorul (acela prinde halucinații de
// conținut, gen nume inventate) — verifică 2 tipare de formă concrete, deja
// văzute în producție, pe care un evaluator LLM le poate rata din nou într-o
// zi mai puțin norocoasă. Regex, nu apel de model — determinist, gratuit,
// instant.
const SYSTEM_ARTIFACT_IN_TITLE = /\((detalii incomplete|nespecificat[ăa]?|neconfirmat[ăa]?|de completat|lipsă)\)/i;
const MISSING_INFO_AS_CHARACTERISTIC = /nespecificat|neconfirmat|nu (a )?(fost )?(transmis|specificat|precizat)|lips[ăa]/i;
// Backstop fără AI pentru secțiunea "Cum se folosește" — regex, nu model,
// tocmai pentru că evaluatorul AI a ratat termeni medicali reali cel puțin
// o dată (vezi DECISIONS.md, cazul "hipoalergenic"/"efect calmant"). Lista
// extinsă cu exact termenii găsiți atunci, plus cei ceruți acum explicit.
const MEDICAL_LANGUAGE = /beneficii? de s[ăa]n[ăa]tate|efect(e)? terapeutic|remediu|recomandare medical[ăa]|valoare(a)? nutriț|hipoalergen|alergi|calmant|r[ăa]ceal[ăa]|grip[ăa]|digesti|imunitar|antiseptic|cicatriz|vindec[ăa]/i;
// Descriere de ambalaj în text — same regex family as VISUAL_CLAIM_PATTERN,
// dar aplicat strict pe paragraful principal, nu pe tot draftul.
const PACKAGING_IN_DESCRIPTION = /borcan|capac|etichet[ăa]/i;

function validateListing(listing) {
  const problems = [];

  if (SYSTEM_ARTIFACT_IN_TITLE.test(listing.title || '')) {
    problems.push('Titlul conține un artefact de sistem (ex: "(detalii incomplete)") în loc de un titlu vandabil curat.');
  }

  const badCharacteristics = (listing.characteristics || []).filter((c) => MISSING_INFO_AS_CHARACTERISTIC.test(c));
  if (badCharacteristics.length > 0) {
    problems.push(`Caracteristici care descriu lipsă de informație, nu produsul: ${badCharacteristics.join('; ')} — ar trebui mutate în confidenceNotes.`);
  }

  const description = listing.description || '';
  if (MEDICAL_LANGUAGE.test(description)) {
    problems.push('Descrierea conține limbaj medical/terapeutic interzis (beneficii de sănătate, remediu, etc.) — secțiunea "Cum se folosește" trebuie să rămână strict culinară.');
  }

  // Paragraful principal = tot ce e înainte de prima secțiune opțională
  // ("Despre acest soi:" / "Cum se folosește:") — dacă ambalajul apare
  // acolo, nu în characteristics, e exact interdicția cerută explicit.
  const mainParagraph = description.split(/Despre acest soi:|Cum se folosește:/)[0];
  if (PACKAGING_IN_DESCRIPTION.test(mainParagraph)) {
    problems.push('Paragraful principal al descrierii menționează ambalajul (borcan/capac/etichetă) — asta aparține cel mult unei linii în characteristics, nu descrierii.');
  }

  return { valid: problems.length === 0, problems };
}

/**
 * Coordonează Generator + Evaluator (pattern-ul Evaluator-Optimizer), cu o
 * buclă de rafinare (max 2 treceri, ca să nu explodeze costul/timpul într-un
 * demo) — nu Orchestrator-Workers, doar folosește cuvântul "orchestrează" în
 * sensul comun, de funcție care coordonează alte două funcții secvențial.
 * Întoarce și `log`-ul complet al pașilor agentului, ca furnizorul să poată
 * vedea transparent cum a "gândit" AI-ul.
 */
export async function analyzeProduct({ imagePaths, rawName, rawPrice, rawQuantity, rawNotes }) {
  const images = imagePaths.map((p) => ({
    base64Image: fs.readFileSync(p).toString('base64'),
    mediaType: guessMediaType(p),
  }));
  const rawInfo = { rawName, rawPrice, rawQuantity, rawNotes };

  const log = [];
  let draft = await runGenerator({ images, ...rawInfo }, log);
  log.push({ step: 'draft_generated', draft });

  const MAX_REFINE_ROUNDS = 2;
  let everApproved = false;
  for (let i = 0; i < MAX_REFINE_ROUNDS; i++) {
    const verdict = await runEvaluator(draft, rawInfo, log, images);
    if (verdict.approved) { everApproved = true; break; }

    draft = await runGenerator({ images, ...rawInfo, feedback: verdict.feedback }, log);
    log.push({ step: 'draft_revised', draft });

    // Bug real, găsit prin verificare directă în DB pe un produs publicat:
    // ultima rescriere (după ce s-au epuizat rundele de rafinare) nu era
    // niciodată reevaluată — putea reintroduce nesancționat o problemă deja
    // corectată cu o rundă în urmă (feedback-ul trimis la fiecare rescriere
    // e doar ultimul, nu istoricul complet). Evaluăm și acest ultim draft;
    // dacă tot nu e aprobat, nu mai rescriem din nou (am epuizat bugetul de
    // runde), dar semnalăm explicit furnizorului, în loc să lăsăm o
    // halucinație posibilă să treacă drept conținut verificat.
    if (i === MAX_REFINE_ROUNDS - 1) {
      const finalVerdict = await runEvaluator(draft, rawInfo, log, images);
      // Bug real #2, găsit prin recitire de cod (nu prin test — n-a fost
      // exercitat empiric în cele 5 teste anterioare): everApproved nu era
      // setat aici dacă TOCMAI această ultimă evaluare aproba draftul —
      // rămânea `false`, făcând needsManualReview să iasă fals-pozitiv
      // `true` chiar și când evaluatorul chiar aprobase la ultima verificare.
      everApproved = finalVerdict.approved;
      if (!finalVerdict.approved) {
        draft.confidenceNotes = [
          draft.confidenceNotes,
          `Verificare automată nereușită complet — verifică cu atenție: ${finalVerdict.feedback}`,
        ].filter(Boolean).join(' ');
      }
    }
  }

  if (!CATEGORIES.includes(draft.category)) draft.category = 'Alte produse apicole';

  // Validare programatică, fără AI — vezi comentariul de la validateListing.
  // Dacă eșuează, NU regenerăm din nou (ar costa un apel AI suplimentar
  // pentru o problemă pe care oricum n-o putem garanta reparată de un al
  // treilea LLM call) — păstrăm draftul curent, dar îl marcăm explicit
  // pentru furnizor.
  const validation = validateListing(draft);
  log.push({ step: 'validation', valid: validation.valid, problems: validation.problems });

  // needsManualReview = true dacă regex-urile găsesc unul din cele 2 tipare
  // exacte de mai sus, SAU dacă evaluatorul n-a aprobat niciodată draftul,
  // în nicio rundă — găsit real, cu un produs care a epuizat toate cele 3
  // evaluări fără aprobare (repetiții + confuzie mostre-de-culoare/poză
  // reală) și rămăsese totuși needsManualReview=false, pentru că regex-urile
  // verifică doar 2 tipare specifice, nu "evaluatorul a respins constant".
  // 3 respingeri la rând sunt un semnal mult mai puternic decât oricare din
  // cele 2 tipare — motivul pentru mesajul explicit deja pus în
  // confidenceNotes mai sus (`Verificare automată nereușită complet...`)
  // rămâne cauza EXACTĂ a lui !everApproved, deci nu îl mai repetăm aici.
  draft.needsManualReview = !validation.valid || !everApproved;
  if (!validation.valid) {
    draft.confidenceNotes = [
      draft.confidenceNotes,
      `Validare automată (fără AI) a găsit probleme de formă: ${validation.problems.join(' ')}`,
    ].filter(Boolean).join(' ');
  }

  return { draft, log };
}
