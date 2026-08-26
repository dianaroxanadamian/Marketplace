# Decizii și proces — Fagure

Acest document explică procesul dincolo de cod: ce întrebări de clarificare au apărut, cum a fost aleasă soluția, cum a evoluat implementarea, și unde am corectat sau respins ce a generat AI-ul.

## Întrebări de clarificare (răspunse înainte de implementare)

**Upload: un produs = o poză sau mai multe?** Mai multe (2-5) — practic un cumpărător vrea să vadă produsul din unghiuri diferite înainte să aibă încredere să cumpere de la un furnizor necunoscut.

**Categoriile sunt fixe sau le generează AI-ul liber?** Fixe, dintr-o listă predefinită, pe care AI-ul o cere ca tool în loc să primească doar lista în prompt. Am ales asta pentru consistență în UI (filtrare pe marketplace) — categorii libere ar fi dus la variante ușor diferite ale aceluiași lucru ("Miere de salcâm" vs "miere salcam").

**Ce se întâmplă dacă furnizorul nu revizuiește niciodată produsul generat de AI?** Am separat starea "AI a generat, nimeni nu s-a uitat încă" (`pending_review`) de "furnizorul a editat și a ales să lase pentru mai târziu" (`draft`).

**Ce se întâmplă dacă apelul AI eșuează?** Inițial: pierdere completă — poza era ștearsă, request-ul pica cu 500. Reparat — produsul e inserat oricum, cu `ai_failed=true` și opțiune de reîncercare sau completare manuală, fără reupload. Testat live cu un eșec real de billing (nu simulat).

## Decizii de arhitectură

**SQLite via `node:sqlite`, nu `better-sqlite3`.** `better-sqlite3` cere compilare nativă (node-gyp), care eșuează fără Visual Studio Build Tools. `node:sqlite` e nativ din Node.js, fără nicio dependință de compilare. Compromis: dependență de o versiune de Node relativ recentă, acceptabil pentru un prototip local.

**Poze stocate ca JSON array într-o singură coloană (`image_paths`), nu tabel separat.** Proiectul deja serializează alte câmpuri (caracteristici, agent_log) la fel — consecvent cu convenția existentă. Pentru 2-5 poze fără nevoie de metadate per-poză, un tabel separat ar aduce join-uri fără beneficiu real.

## Revizuire majoră de scop: autentificare, coș și panou de admin

Inițial am decis explicit să NU construim autentificare reală, coș de cumpărături sau dashboard de admin, cu argumentele: (1) rularea locală, demonstrabilă, e suficientă fără flux de plată; (2) ar fi însemnat practic un al doilea produs, cu suprafață de securitate semnificativă greu de testat în timp limitat; (3) risca să dilueze exact ce conta cel mai mult — judecata de arhitectură și pipeline-ul AI.

Am revizuit ulterior această decizie și am construit totuși autentificare reală (cont cumpărător/furnizor, parole hash-uite), coș informativ și panou de admin cu statistici (cumpărători, furnizori, comenzi, produse publicate) și jurnal de activitate. Motivul: am considerat că o demonstrație mai completă a fluxului, de la creare cont până la "cumpărare", arată mai bine intenția de marketplace funcțional.

Această extindere a mărit semnificativ suprafața de securitate testată (parole, sesiuni, autorizare pe roluri) — a necesitat verificare suplimentară dedicată, documentată mai jos, separat de fluxul central de AI care rămâne miezul proiectului.

## Bug-uri și vulnerabilități găsite și reparate

1. **Model Claude invalid (`claude-sonnet-4-6`).** Cod scris inițial cu un id de model inexistent — ar fi cauzat eșec 404 la toate apelurile AI. Corectat la `claude-sonnet-5`.

2. **Gap de autorizare server-side.** Rutele de editare/publicare/ștergere filtrau "vezi doar produsele tale" doar în UI, nu și pe server — oricine cunoștea un ID de produs putea edita/publica/șterge produsul altui furnizor prin API direct. Reparat cu verificare server-side (`requireOwner`), testat cu 7 cazuri live prin HTTP real.

3. **Status pe doar 2 stări, nu 3.** Un produs nerevizuit era indistinct de unul editat și lăsat intenționat ca ciornă. Adăugat `pending_review` ca stare separată, plus `reviewed_at`.

4. **Buget de tokeni insuficient, mascat de thinking adaptiv.** La primul test end-to-end cu credit real, evaluator-optimizer crapa ("Cannot read properties of undefined"). Cauza: `claude-sonnet-5` rulează adaptive thinking implicit, care consumă din același buget ca `max_tokens`; la valorile inițiale (400 evaluator, 1200 generator), thinking-ul epuiza bugetul înainte ca JSON-ul final să apară în răspuns. Am ales să măresc bugetele (evaluator → 1500, generator → 4000) în loc să dezactivez thinking-ul, pentru că dezactivarea lui pe modele cu tool-calling riscă scrierea apelurilor de tool ca text vizibil în loc de apel structurat — un compromis mai riscant decât un buget mai mare. Verificat live, cu logging temporar al request-ului real (scos din cod după confirmare). *(Notă: aceste valori au fost mărite din nou mai târziu — vezi mai jos, secțiunea despre RAG de soiuri — la 2500/5000, după ce promptul evaluatorului a mai crescut. Valorile curente din cod sunt 2500/5000, nu 1500/4000.)*

5. **Draftul final din bucla evaluator-optimizer nu era niciodată reevaluat — halucinație reală, prinsă în producție.** Găsit nu prin test controlat, ci verificând direct în DB un produs real, publicat prin aplicație: titlul genera "Stupina Damian" ca nume de producător, deși `raw_name`/`raw_notes` nu conțineau acest detaliu și niciun alt produs din catalog nu-l menționa (deci nu venea nici din RAG). Din `agent_log` complet: runda 1 a inventat numele → evaluatorul a respins explicit pentru asta → runda 2 (rescrisă) a corectat numele, dar a introdus alte halucinații (detalii senzoriale) → evaluatorul a respins din nou → **al treilea draft, generat ca ultimă rescriere, nu mai era evaluat deloc** (bucla se oprea după 2 evaluări, nu 2 rescrieri) — și tocmai acel draft neverificat a reintrodus numele inventat și a fost salvat ca atare. Cauza structurală: fiecare rescriere primește doar ultimul feedback, nu istoricul complet, deci modelul "uită" o corecție făcută cu o rundă în urmă. Reparat: ultima rescriere e acum evaluată și ea; dacă tot nu e aprobată, nu se mai rescrie din nou (bugetul de runde rămâne limitat), dar feedback-ul evaluatorului e adăugat explicit în `confidenceNotes`, vizibil furnizorului, în loc să treacă drept conținut verificat.

6. **SESSION_SECRET și parolă de admin hardcodate.** La verificarea explicită a modului de stocare a parolelor (bcrypt, confirmat corect implementat — `bcrypt.hashSync` cu salt rounds 10, `bcrypt.compareSync` la verificare, niciodată comparație de string-uri), am descoperit o problemă adiacentă: `SESSION_SECRET` lipsea din `.env`, deci sesiunile erau semnate cu un string hardcodat direct în `server.js`, vizibil oricui citește sursa — ar fi permis falsificarea cookie-urilor de sesiune, inclusiv de admin. Găsit același pattern la parola implicită de admin (`admin123`, hardcodată). Reparat: eliminate ambele fallback-uri din cod; serverul generează automat `SESSION_SECRET` random (32 bytes), salvat în `.env`, și o parolă de admin random dacă lipsește din `.env` — aceasta din urmă e afișată o singură dată în consolă la creare, nu se salvează automat nicăieri (dacă se pierde, singura recuperare e ștergerea rândului din `users` și restart, ca să se regenereze). Hash-ul contului admin existent a fost rotit pentru noua parolă.

## Testare AI end-to-end — rezultat real

Rulat cu credit activ pe cheia Anthropic, 3 poze reale (decupaje diferite ale aceluiași borcan) + notă text "miere de salcâm, recoltă Muntenia, mai 2026". Rezultate:

- Toate cele 3 poze au ajuns la Claude (confirmat din payload-ul real, nu presupus din cod)
- Evaluator-optimizer a intervenit de 2 ori, nu a trecut din prima — a cerut rescriere pentru caracteristici repetate din descriere/titlu, un detaliu generic prezentat ca fapt cert, și o dată eronată
- Modelul a semnalat singur, fără să i se ceară explicit, o inconsistență reală (data din notele furnizorului era în viitor față de momentul publicării)
- `agent_log` complet (17 pași) verificat vizual în UI, pe pagina de review a furnizorului

**Retestat de la zero**, mult mai târziu în proces (după toate modificările de UI/accesibilitate), ca să confirm că fluxul complet tot funcționează, nu doar la momentul construirii lui: cont nou de furnizor → 2 poze reale + notă cu an în viitor ("recoltata iunie 2026") → evaluatorul a respins din nou de 2 ori (max rundele permise) — o dată pentru date inventate necorespunzând notelor furnizorului ("zone nepoluate", "direct de la stup"), o dată pentru caracteristici repetitive cu titlul/descrierea → editat manual titlul în pagina de review → confirmat persistat în DB și că **rămâne nepublicat** până la acțiunea explicită de publish → publicat → confirmat apariția pe pagina publică reală (nu doar în API). Produsul și contul de test au fost șterse după verificare (inclusiv pozele de pe disc, prin ruta de delete existentă).

**Al doilea eșec real de billing, prins de utilizator din propria folosire a aplicației** (nu într-un test al meu): la o încercare reală de upload, Anthropic a răspuns `400 "Your credit balance is too low to access the Anthropic API"`. Comportamentul de fallback documentat mai sus a funcționat din nou, în condiții reale, nu doar testat o dată: produsul s-a inserat oricum cu `ai_failed=true`, pozele deja urcate nu s-au pierdut, eroarea reală a fost afișată cu detalii tehnice expandabile, iar câmpurile au rămas disponibile pentru completare manuală. Confirmă că fallback-ul e robust, nu un caz izolat care a funcționat din întâmplare o singură dată.

**Exemplu suplimentar de halucinație prinsă de evaluator**, la o rulare reală ulterioară (credit redisponibilizat), pe un caz diferit de cele de mai sus — merită reținut separat pentru că prinde 2 tipuri distincte de invenție într-o singură rulare:
- Runda 1: evaluatorul a respins draftul pentru că modelul inventase un nume de producător ("Stupina Damian") folosit ca "Origine" în titlu, descriere și caracteristici — nume care nu apărea nicăieri în `rawName`/`rawNotes` furnizate de furnizor.
- Runda 2, după rescriere: evaluatorul a respins din nou — de data asta pentru că descrierea/caracteristicile prezentau detalii senzoriale generice pentru miere de salcâm (gust delicat, cristalizează greu, culoare aurie deschisă) ca fapte verificate, deși furnizorul trimisese doar nume/preț/cantitate, fără nicio observație senzorială proprie. Evaluatorul a cerut fie eliminarea lor, fie reformularea ca generalizări tipice ale soiului, nu ca observații confirmate — plus a semnalat și o caracteristică redundantă cu titlul.

Acest exemplu arată clar diferența dintre "textul sună plauzibil" și "textul e verificat" — exact miza evaluator-optimizer-ului, nu doar generare + afișare directă.

## Verificare flux cumpărător (coș → comandă)

Face parte din revizuirea de scop (coș + comandă) — verificat live, la fel
de riguros ca fluxul de furnizor: produs
publicat existent → "Adaugă în coș" din pagina de detaliu → cont nou de
cumpărător creat prin `/inregistrare` (submit real, nu presupus) → `/cos`
arată totalul corect → "Finalizează comanda" → confirmat prin
`GET /api/orders/mine` că există o comandă reală în DB, cu produsul, prețul
și furnizorul corecte, nu doar mesajul de succes din UI. Cont și comandă de
test șterse după verificare.

## Instabilitate tranzitorie la pornire cu `npm run dev`

La pornire curată, `node --watch server.js` s-a restartat singur de 2 ori
imediat după boot, cauzând ERR_CONNECTION_RESET pe prima cerere din
browser. Cauza: verificările de migrare din database.js ating fișierele
WAL/SHM ale SQLite la boot, iar --watch le interpretează greșit ca
schimbare de cod. Confirmat cu teste controlate că, odată stabilizat,
scrierile normale nu mai declanșează restart-uri — instabilitate doar
la pornire, nu problemă continuă, și nu afectează npm start/producție.
Nu reparat (fix simplu ar fi excluderea folderului DB din watch, dar
nu blochează funcționarea) — notă pentru cine rulează local: așteaptă
2-3 secunde după pornire înainte de prima cerere.

## Audit mobil (375px) — 2 bug-uri găsite și reparate

1. Navbar overflow pe toate paginile (163px logat ca furnizor, 28px
   delogat) — link-urile pe un singur rând flex, fără wrap. Reparat cu
   meniu hamburger sub breakpoint md (drawer vertical, temă neschimbată),
   desktop rămâne identic.

2. Titlul produsului din coș trunchiat ilizibil pe mobil — container de
   doar 82px lățime, clasa truncate tăia textul. Reparat cu layout
   stivuit sub sm: imagine+titlu pe un rând (fără truncate, poate wrapui
   pe mai multe linii), cantitate+Șterge pe rândul următor.

Ambele verificate prin măsurători DOM (scrollWidth/clientWidth, prezența
clasei truncate), nu doar vizual — capturile de ecran din acest mediu de
testare aveau artefacte de randare care ar fi indus concluzii greșite
dacă m-aș fi bazat doar pe ele.

## Verificare finală a funcționalităților

Trecere explicită prin fiecare funcționalitate cheie, verificată direct în cod/aplicație (nu doar din memorie), la finalul sesiunii de lucru:

| Funcționalitate | Status | Dovadă |
|---|---|---|
| Furnizor încarcă poze + info de bază | ✅ | `SupplierUpload.jsx` — 2-5 poze (`MIN_IMAGES=2, MAX_IMAGES=5` în `products.js`), contact/nume/preț/cantitate/notițe. Retestat complet, de la zero, cu request HTTP real: 201, poze salvate pe disc, câmpuri persistate corect. Nuanță: am adăugat autentificare ca extindere de scop, deci acum doar un furnizor *cu cont* poate încărca (nu oricine anonim) — interpretare rezonabilă a cuvântului "furnizorii" (produsul afișează "de la stupina X"), dar tehnic o restricție peste varianta minimă |
| Mecanism de trimitere liber ales | ✅ | Formular multipart → Express + Multer → disc local (`server/uploads/`) |
| Modul AI analizează și pregătește titlu/descriere/categorie/caracteristici | ✅ | `aiAnalyzer.js` — pipeline Generator (3 tool-uri) + Evaluator-Optimizer (7 criterii) + validare programatică fără AI, verificat live cu poze reale + credit real — vezi secțiunea dedicată de mai jos pentru evoluția completă |
| Furnizor verifică/editează înainte de publicare | ✅ | `SupplierReview.jsx` — toate câmpurile editabile, Salvează/Publică/Salvează ca ciornă |
| Pagină de marketplace publică, plăcută, ușor de folosit | ✅ | `Marketplace.jsx` + `ProductDetail.jsx`, audit mobil (375px) + audit DevTools, hero recentrat cu CTA-uri vizibile, "Adaugă în coș" direct pe grid |
| Rulează local, fără nevoie de publicare online | ✅ | Backend :4000 + frontend :5173, SQLite local, poze pe disc local |
| Stack liber, dar procesul de gândire contează | ✅ | README.md (3 axe de clarificare) + acest document |
| AI folosit cu discernământ, rezultate verificate, coordonare directă | ✅ | Bug-urile din acest document — toate găsite prin verificare activă, nu presupuse din cod |

Toate funcționalitățile de bază sunt respectate și verificate.

## Audit DevTools (Console/Issues) — 2 probleme găsite și reparate

Semnalate de utilizator dintr-o captură a panoului Console/Issues din Edge DevTools (pe lângă un warning ignorabil de React DevTools):

1. **"A form field element should have an id or name attribute."** Verificarea a arătat că nu era un caz izolat — aproape toate input-urile din aplicație (nu doar cel semnalat) nu aveau `id`/`name`, deci nici `<label htmlFor>` nu se putea lega corect de câmp. Reparat sistematic, în toate cele 6 fișiere cu câmpuri de formular: `Login.jsx`, `Register.jsx` (`id`/`name`/`autoComplete` + `htmlFor`), `SupplierUpload.jsx` (contact, denumire, cantitate, preț, notițe, input-ul de fișiere), `SupplierReview.jsx` (titlu, categorie, preț, cantitate, descriere, caracteristici), `Cart.jsx` (input-ul de cantitate, randat în `.map()` — `id`/`name` unic per rând, `qty-{productId}`, plus `<label className="sr-only">` fiindcă nu avea label vizibil), `Marketplace.jsx` (căutarea, cu `aria-label` fiindcă nu avea label vizibil).

2. **"[Intervention] Images loaded lazily and replaced with placeholders."** Cauza: caruselul "Colecția noastră" avea `loading="lazy"` pe imagini, dar secțiunea începe imediat după hero-ul de `85-90vh` — pe multe ecrane acele imagini sunt deja în/lângă viewport la încărcare, exact situația în care Chrome consideră lazy-loading contraproductiv și intervine. Scos `loading="lazy"` din acel carusel; păstrat pe grid-ul principal de produse de mai jos, care e cu adevărat sub fold.

Verificat live, nu doar din cod: server-ele repornite, cont nou de furnizor creat prin formularul real de `/inregistrare` (submit real prin `form.requestSubmit()`, nu presupus), parcurs `/adauga-produs` → `/cos` (produse adăugate direct în `localStorage`, în formatul citit de `CartContext`, ca să pot verifica randarea fără să depind de o analiză AI reușită). Pe fiecare pagină am citit DOM-ul (`document.querySelectorAll('input,textarea,select')`) și am confirmat `id`/`name`/`label[for]` corecte; pentru imagini am verificat atributul `loading` calculat pe fiecare `<img>` din pagină (carusel → `auto`, grid → `lazy`).

A rămas în DB local un cont furnizor de test creat pentru verificare (`test-supplier-...@example.com`) — inofensiv pentru un prototip local, dar netears automat.

Am mai verificat, la cererea explicită de a analiza toată aplicația și nu doar cazul semnalat: toate elementele `<img>`/`<motion.img>` din `client/src` au deja `alt` corect (fie descriptiv, fie `alt=""` intenționat pe thumbnail-uri decorative lângă text) — nicio altă problemă sistemică de acest tip găsită.

## Polish UI/UX — hero, animații, conversie

1. **Text din hero lipit de partea de sus, necentrat față de mascotă.** Cauza: coloana de text avea `md:mt-[122px]` fix, care anula centrarea automată dată de `items-center` pe grid-ul părinte — margin-ul împingea textul în afara poziției centrate calculate de grid. Reparat prin eliminarea margin-ului. Verificat cu măsurători DOM, nu doar vizual: înainte, mijlocul textului și mijlocul mascotei erau la 61px distanță; după, identice (492px, ambele).

2. **Spațiu în stânga textului din hero, la cerere.** Adăugat `md:pl-12` pe coloana de text — ajustare mică, doar pe desktop, ca să nu deranjeze layout-ul mobil deja verificat la auditul de 375px.

3. **Animații suplimentare pe mascotă** (wobble ±2° / 5.5s, particule de polen care apar/dispar, glow pulsatil — acesta din urmă exista deja, nu a fost duplicat). Wobble-ul e pe un wrapper propriu, separat de cel care face float-ul vertical și de spring-ul framer-motion de pe imagine — 3 transform-uri CSS pe același element s-ar fi suprascris reciproc, nu s-ar fi compus. Toate respectă `prefers-reduced-motion` prin guard-ul CSS global deja existent în `index.css` (`animation-duration: 0.01ms !important` pe `*`), fără cod nou de accesibilitate.

   **Bug real prins la verificare:** după ce am adăugat noul keyframe `wobble` în `tailwind.config.js`, serverul Vite deja pornit nu l-a preluat — CSS-ul servit tot nu conținea `wobble` după reload de pagină. Repornirea completă a procesului Vite a rezolvat-o. Notă pentru viitor: schimbările în `tailwind.config.js` nu sunt mereu prinse de HMR, spre deosebire de schimbările în componente.

4. **CTA-urile din hero erau linkuri de text subtile, greu de observat.** Transformate în butoane reale (plin auriu pentru acțiunea principală, conturat pentru cea secundară), cu același stil folosit deja în restul aplicației (`rounded-full`, `px-6 py-3`), nu un stil nou inventat.

5. **Lipsea "Adaugă în coș" direct pe cardurile din grid-ul de marketplace** — exista doar pe pagina de detaliu a produsului. Cardul întreg era un singur `<Link>`, deci n-a fost doar "adaugă un buton": am restructurat `ProductCard.jsx` ca link-ul să acopere doar zona poză+titlu+descriere, iar prețul + noul buton să fie într-un rând separat, în afara link-ului — un `<button>` imbricat într-un `<a>` ar fi HTML invalid și ar naviga înainte să apuce să adauge în coș. Verificat live: click pe buton adaugă produsul și NU navighează; click pe restul cardului navighează normal la pagina de produs.

## Verificare față de definițiile reale ale pattern-urilor, plasă de siguranță și RAG de soiuri

**Verificat față de definițiile reale ale pattern-urilor, nu din memorie**:
am comparat pipeline-ul AI direct cu structura consacrată a fiecărui pattern.
Confirmat: Generatorul reproduce fidel pattern-ul **Agents** (nu
Orchestrator-Workers, cum spunea greșit un comentariu — corectat), iar
`runEvaluator`+bucla reproduc fidel **Evaluator-Optimizer**. Limitări asumate
explicit, nu ascunse: fără exemple few-shot în prompt (reparat mai jos), RAG
lexical (TF-IDF) nu semantic (embeddings), și memoria evaluator-optimizer nu
se acumulează între runde — exact cauza structurală a bug-ului #5 de mai sus.

**Întărit prompt-ul generatorului** cu regulă anti-invenție explicită (nu
inventa nume de brand, nu prezenta detalii senzoriale ca fapte certe) și un
exemplu few-shot pentru context gol. Testat live, de la zero (toate produsele
șterse din DB și de pe disc, readăugate pe rând): fără halucinație de nume,
dar au apărut 2 probleme noi de FORMĂ — artefact de sistem în titlu
("(detalii incomplete)") și lipsă-de-informație tratată ca o caracteristică.

**Adăugat, ca reacție directă la acele 2 probleme:**
1. **`validateListing()`** — validare programatică, FĂRĂ AI, regex determinist
   pe cele 2 tipare exacte găsite. Rulează după evaluator, nu regenerează
   (cost/risc de buclă) — doar marchează `needsManualReview=true`, vizibil
   printr-un banner roșu dedicat în `SupplierReview.jsx`.
2. **RAG de soiuri** (`honeyVarieties.js`, 8 soiuri românești + `honeyVarietyLookup.js`,
   căutare pe cuvânt întreg — un `.includes()` naiv ar fi dat fals-pozitiv pe
   "tei" găsit în "proteine") + tool nou `obtine_info_soi`, cu regulă de
   prompt explicită: informația se folosește DOAR ca generalizare ("de
   regulă..."), niciodată ca fapt cert, și tool-ul nu se apelează dacă
   furnizorul n-a menționat un soi.

**Bug real: bugetul evaluatorului insuficient a doua oară.** Ce s-a
întâmplat: după ce am adăugat 2 criterii noi la prompt-ul evaluatorului,
cererile au început să eșueze cu JSON tăiat la mijloc. De ce: exact cauza de
la bug-ul #4 (thinking adaptiv consumă din `max_tokens`) — promptul mai lung
a împins evaluatorul peste bugetul de 1500. Cum a fost reparat: bugete
mărite, evaluator 1500→2500, generator 4000→5000. Cum a fost verificat:
reprodus live, apoi retestat cu succes după fix, confirmat prin răspuns
`201` complet în loc de eroare.

**Bug real: evaluatorul nu vedea pozele, fals-pozitiv pe o observație
corectă.** Ce s-a întâmplat: evaluatorul a respins caracteristica "Etichetată
explicit ca «Poliflora de Munte»", deși eticheta chiar scrie asta (verificat
cu ochiul liber pe poza reală). De ce: `runEvaluator()` primea doar text
(draft + context brut), niciodată pozele, deci trata orice detaliu vizual
neconfirmat de `rawNotes` ca halucinație, chiar și când era o citire corectă
a etichetei. Cum a fost reparat: gating condiționat — pozele se trimit la
evaluator DOAR dacă draftul face o afirmație verificabilă vizual (regex pe
cuvinte cheie: etichetă, culoare, ambalaj, borcan, capac, aspect, textură,
"se observă/se vede", fotografie/imagine/poză), nu la fiecare rundă
necondiționat (compromis de cost discutat explicit înainte de
implementare: ~6.000-9.600 tokeni/produs estimat, apoi măsurat real). Cum a
fost verificat: retestat cu exact același caz — aprobat corect din prima
rundă (nu mai respinsă), cu poze incluse (`imagesIncluded: true` în
`agent_log`), cost real măsurat 1235 input/734 output tokeni pe acel apel.

**Verificare finală, test A + test B**: context gol → titlu curat, fără
artefacte, `needsManualReview: false`; `rawName="Miere de salcâm"` →
`obtine_info_soi` apelat real cu `{"soi":"salcâm"}` (confirmat din
`agent_log`), generalizări corect formulate cu "De regulă...".

**5 teste suplimentare, câte un produs pe rând** (date parțiale, caz-limită
cu poze nereale, caz fericit cu poze reale) au confirmat, printre altele, că
`needsManualReview` rămânea `false` chiar și când evaluatorul respingea
draftul de 3 ori la rând, fără să aprobe niciodată — semnal mult mai
puternic decât cele 2 tipare exacte verificate prin regex. Reparat:
`needsManualReview = !validation.valid || !everApproved`, unde `everApproved`
urmărește dacă vreo rundă a fost aprobată vreodată.

**Verificare cu o distincție onestă, nu doar "a mers":** la retest, cu
exact același input care produsese 3 respingeri prima dată, modelul a
aprobat din runda 2 (LLM-urile nu sunt perfect deterministe — același input
nu garantează aceeași buclă de fiecare dată). `needsManualReview` a ieșit
totuși `true`, dar prin mecanismul deja existent (`validateListing()`), nu
prin ramura nouă (`!everApproved`) — testul n-a izolat empiric noua ramură.
Am acceptat drept dovadă inspecția de cod, nu re-testare repetată: expresia
e un OR determinist (`!validation.valid || !everApproved`), a cărei
corectitudine nu depinde de nedeterminismul modelului — dacă bucla se
termină vreodată fără nicio aprobare (cum s-a întâmplat real la testul
inițial), `everApproved` rămâne `false` garantat, indiferent ce zice
regex-ul. Distincția contează: empiric am dovedit doar rezultatul final
corect, prin inspecție de cod am dovedit mecanismul exact.

## Audit de consistență README ↔ DECISIONS.md ↔ cod

La cerere explicită, am verificat linie cu linie cele două documente față de
codul real (`aiAnalyzer.js`, `toolRegistry.js`, `server.js`, `package.json`,
`categories.js`, structura de fișiere) — nu presupunere, citire directă.
Găsit și reparat:

1. **`server/.env.example` nu exista** — README (`cp .env.example .env`) și
   chiar `server.js` (mesajul de warning la boot) trimiteau amândouă la un
   fișier inexistent; pe un checkout curat, pasul de setup ar fi eșuat.
   Creat, cu aceleași chei ca `.env` real dar doar placeholder-uri — testat
   izolat că `cp` funcționează acum.
2. **README pretindea "un singur fișier" pentru toată logica AI** — nu mai e
   adevărat, logica e acum în 6 fișiere sub `services/`+`data/`. Corectat.
3. **README zicea "două tool-uri"** — sunt 3 (`obtine_info_soi` lipsea din
   descriere, deși există în cod și în `DECISIONS.md`). Corectat, cu
   descriere.
4. **Criteriile evaluatorului descrise incomplet în README** (4 din 6) —
   completat cu criteriile 5-6 (nume inventat, detalii senzoriale ca fapte).
5. **Bug #4 din lista de mai sus avea valori de buget depășite** (1500/4000)
   fără notă că au fost mărite din nou ulterior (2500/5000) — adăugată notă
   explicită, fără să rescriu descrierea originală a bug-ului.
6. **Regex-ul de gating descris incomplet** mai sus (5 din ~12 cuvinte cheie
   din pattern-ul real) — completat.

Verificat și confirmat CORECT, nu doar presupus: numărul de categorii (9),
versiunea de Node necesară vs. instalată, porturile, structura de
pagini/componente client, comenzile `npm start`/`npm run dev` — nicio
discrepanță găsită acolo.

## Arhitectura AI — stare curentă (referință pentru prezentare)

Secțiune de referință, nu narativă — descrie exact ce e implementat ACUM în
`aiAnalyzer.js`/`toolRegistry.js`, nu istoricul. Utilă de citit separat,
fără să parcurgi tot jurnalul cronologic de mai sus.

**3 straturi combinate**, în `server/services/`:
1. **Generator — pattern "Agents"** (`runGenerator`) — un agent cu
   tool-calling, într-o buclă (max 4 runde): apelează modelul, execută
   tool-urile cerute, trimite rezultatul înapoi, se oprește la primul răspuns
   fără `tool_use`. NU e Orchestrator-Workers (fără subtask-uri, fără workeri
   paraleli — un singur agent secvențial).
2. **Evaluator-Optimizer** (`runEvaluator` + bucla din `analyzeProduct`,
   max 2 runde de rafinare) — al doilea apel, independent, pe 6 criterii
   (titlu, categorie, nimic inventat, non-repetiție, **nume de brand
   inventat**, **detalii senzoriale/vizuale ca fapte certe**). Pozele se
   trimit la evaluator DOAR condiționat (draftul face o afirmație vizuală de
   verificat). Ultima rescriere e reevaluată și ea, nu lăsată nesancționată.
3. **Validare programatică, fără AI** (`validateListing`) — regex determinist
   pe 2 tipare de formă cunoscute (artefact de sistem în titlu, lipsă-info ca
   și caracteristică). Marchează `needsManualReview=true` dacă validarea
   eșuează SAU dacă evaluatorul n-a aprobat niciodată draftul (`everApproved`).

**Flux complet**: upload (2-5 poze + info opțională) → Generator (cu
tool-calling) → Evaluator (până la 2 runde de rafinare + o reevaluare finală
de siguranță) → fallback categorie dacă e invalidă → validare programatică →
`needsManualReview` calculat → produs salvat `pending_review`, cu `agent_log`
complet → furnizor verifică/editează → publish explicit → `published`.

**3 tool-uri** (`toolRegistry.js`): `cauta_produse_similare` (RAG lexical
TF-IDF peste catalog, sursă de ton nu de fapte), `obtine_categorii_valide`
(lista fixă de 9), `obtine_info_soi` (lookup în 8 soiuri statice — DOAR
generalizare, niciodată fapt cert, doar dacă furnizorul a menționat un soi).

**Bug găsit scriind această secțiune** (nu prin test — recitire de cod):
`everApproved` nu se seta corect dacă tocmai evaluarea finală de siguranță
aproba draftul, rămânea `false`, dând `needsManualReview=true` fals-pozitiv.
Reparat: `everApproved = finalVerdict.approved;` adăugat explicit în acea
ramură. Niciunul din cele 5 teste anterioare nu exercitase exact acest caz.

**Nu se folosește**: Prompt Chaining, Routing, Parallelization,
Orchestrator-Workers, Mixture of Experts, RAG semantic (embeddings) — ambele
"RAG"-uri din proiect sunt lexicale/lookup simplu, decizie asumată explicit
ca simplificare, nu omisiune neștiută.

## Verificare de robustețe pentru demo live — 1 bug de UX găsit, reparat

La cerere explicită, verificare țintită (nu producție, doar ce ar putea
strica o demonstrație live): server pornit fără cheie API, upload de fișier
non-imagine/coruput, formular gol, orice caz care ar putea opri procesul.
Verificat live, empiric — inclusiv testat direct SDK-ul Anthropic izolat
(`new Anthropic({apiKey: undefined})` nu aruncă la construcție).

**Niciun caz găsit care oprește procesul Node** — cheie API lipsă,
imagine coruptă, formular gol, toate cad deja în `try/catch`-urile
existente, cu fallback-uri documentate anterior.

**Bug real de UX (nu de stabilitate)**: 3 cazuri distincte — fișier `.txt`
trimis ca poză, JSON malformat la `/login`, un obiect trimis unde
`PATCH /:id` aștepta text/număr pentru `rawPrice` — răspundeau toate cu
pagina HTML implicită a Express: `500`, stack trace complet, căi absolute
de pe disc (`C:\Users\User\Desktop\...`) expuse direct clientului. De ce:
nu exista niciun middleware de eroare Express custom, deci orice eroare
necontrolată cădea pe handler-ul implicit. Cum a fost reparat: adăugat un
error handler central (4 argumente, ultimul middleware din `server.js`),
care recunoaște cele 3 tipare (JSON malformat, erori Multer, tip greșit
legat în SQLite) și răspunde cu JSON curat, mesaj în română, fără detalii
tehnice — plus un fallback generic pentru orice altă eroare neprevăzută.
Cum a fost verificat: retestate live, exact aceleași 3 cazuri — toate ies
acum `400` cu `Content-Type: application/json` și mesaj clar, în loc de
pagina HTML cu stack trace.

## Curățenie de rămășițe — 4 găsite, toate reparate

La cerere explicită, căutare sistematică în tot codul (server + client) după
resturi din versiuni vechi: referințe la alte stack-uri AI (Gemini,
LangGraph, StateGraph), nume vechi de proiect, fișiere/funcții neapelate de
nimeni, importuri neutilizate, variabile de mediu menționate dar nefolosite.

**Nimic găsit** pe Gemini/LangGraph/StateGraph/nume vechi de proiect —
codul n-are urme dintr-o iterație anterioară cu alt stack. Verificat cu
căutare case-insensitive pe tot proiectul, prin 2 metode diferite.

**4 rămășițe reale găsite, toate reparate:**
1. **Import mort** — `Hex` importat în `SupplierDashboard.jsx`, niciodată
   folosit. Găsit cu `oxlint` (`npm run lint`), nu manual. Șters.
2. **`CLIENT_ORIGIN` folosit în cod, nedocumentat în `.env.example`** —
   are fallback (`localhost:5173`), deci nu bloca nimic, dar cine voia
   să-l suprascrie n-avea de unde ști că există. Adăugat în `.env.example`.
3. **`client/README.md`** — README-ul generic, nemodificat, generat automat
   de `npm create vite` la inițializare, fără nicio legătură cu Fagure
   (documentația reală e la rădăcină, `README.md`+`DECISIONS.md`). Șters.
4. **`client/public/mascot-bee-original.png.bak`** — poza netrimisă a
   mascotei, rămasă din munca de decupare menționată mai sus în acest
   document; fiind în `public/`, era servită static, deci tehnic accesibilă
   public deși inutilă. Ștearsă.

Verificat după fiecare fix: `oxlint` nu mai raportează warning-ul de import
mort, `/produsele-mele` randează corect fără `Hex` (nu era folosit în JSX),
backend sănătos (`/api/health`).

## Audit UX ghidat (landing → upload → review → marketplace → detaliu) — 4 probleme reparate

La cerere explicită, ghid pas-cu-pas prin toată aplicația, ca pentru un
utilizator care n-a mai văzut-o, semnalând explicit orice link mort, stare
netratată (loading/eroare/empty) sau punct unde cineva ar putea rămâne
blocat. 3 probleme reale găsite citind codul (nu presupuse), toate reparate
și retestate live, plus o a 4-a problemă de confidențialitate găsită separat
pe un produs de test real.

1. **`Marketplace.jsx` — loading infinit dacă backend-ul e inaccesibil.** Ce
   era: cele 3 cereri (`getCategories`, `getProducts` pentru "Colecția
   noastră", `getProducts` pentru grid) n-aveau niciun `.catch()` — un
   backend picat lăsa grid-ul blocat pe "Se încarcă produsele..." la
   nesfârșit, fără mesaj, fără ieșire. De ce: promisiuni nerezolvate, fără
   fallback, tratate ca "nu se termină niciodată" de UI. Cum a fost reparat:
   adăugat `.catch()` la toate 3, un state `error` afișat cu mesaj clar +
   buton "Reîncearcă" care repornește cererile (`retryCount` în deps).
   Cum a fost verificat: backend oprit efectiv (`taskkill`) → confirmat live
   mesajul de eroare apare; backend repornit → click pe "Reîncearcă" →
   confirmat grid-ul se încarcă normal, eroarea dispare.

2. **`SupplierReview.jsx` — aceeași problemă, pe pagina de review.** Ce era:
   `api.getProduct(id)` fără `.catch()` — un ID inexistent sau o cerere
   eșuată lăsa pagina blocată pe "Se încarcă..." la nesfârșit, fără mesaj,
   fără link de ieșire. De ce: la fel ca mai sus. Cum a fost reparat: state
   separat `loadError` (distinct de `error`-ul existent, folosit pentru
   eșecuri de salvare/publicare pe pagina deja încărcată), cu mesaj +
   link "← Înapoi la marketplace" — urmează modelul deja corect din
   `ProductDetail.jsx`. Cum a fost verificat: navigat live la
   `/verifica/id-care-nu-exista-deloc` (cont de furnizor autentificat) →
   confirmat mesajul "Produsul nu a fost găsit." + link funcțional spre `/`.

3. **`Footer.jsx` — linkul "Admin" vizibil oricui, indiferent de rol.** Ce
   era: `<Link to="/admin">` necondiționat, afișat tuturor vizitatorilor;
   click, dacă nu erai admin, redirecționa tăcut (login sau homepage) fără
   nicio explicație. De ce: linkul nu verifica deloc rolul utilizatorului
   curent. Cum a fost reparat: `Footer` citește `user` din `useAuth()`,
   linkul se randează doar dacă `user?.role === 'admin'`. Cum a fost
   verificat: testat în ambele direcții, live — logat ca furnizor → linkul
   absent din footer; delogat + logat ca admin real → linkul prezent.

4. **Date de contact personale evidențiate de AI ca "avantaj" al
   produsului — risc de expunere neintenționată.** Ce era: pe un produs de
   test, AI-ul a scos în evidență explicit un nume și un număr de telefon
   reale, vizibile pe etichetă, ca detalii pozitive ale anunțului. De ce:
   promptul generatorului nu avea nicio regulă despre date personale — orice
   text vizibil în poză era tratat ca informație utilă de evidențiat, fără
   distincție. Cum a fost reparat: regulă nouă explicită în system prompt-ul
   generatorului — date de contact personale de pe etichetă nu devin
   caracteristică separată, nu sunt evidențiate în descriere; se poate
   menționa generic "etichetă proprie a producătorului". Cum a fost
   verificat: verificare sintactică + pornire reală a serverului (regulă de
   prompt, nu se poate testa determinist fără o rulare AI nouă cu acea
   etichetă specifică — comportamentul rămâne de confirmat la următorul test
   live cu poze reale conținând date de contact).

## Drag-and-drop nefuncțional pe zona de upload — găsit de utilizator, nu de audit

Găsit de utilizator direct în browser (nu în timpul unui audit de cod), pe
`/adauga-produs`, cu contul propriu real. Ce era: textul dropzone-ului
promitea explicit "Trage poze aici sau apasă pentru a alege", dar zona era
un simplu `<label htmlFor="images">` fără niciun handler de
drag-and-drop — click funcționa (asociere nativă label→input), tragerea
unui fișier deasupra nu făcea nimic vizibil și drop-ul era ignorat. De ce:
un `<label>` nu devine automat zonă de drop în HTML; fără `onDragOver` cu
`e.preventDefault()`, browserul respinge implicit drop-ul (comportamentul
standard e să deschidă fișierul), deci `onDrop` nici nu apuca să se
declanșeze. Cum a fost reparat: extrasă logica de adăugare fișiere
într-un helper reutilizabil `addFiles(fileList)`; adăugate handlere
`onDrop` (preventDefault, `addFiles(e.dataTransfer.files)`), `onDragOver`
(preventDefault obligatoriu, activează un state vizual `isDragging`) și
`onDragLeave`, aplicate pe ambele zone de tip `<label>` — dropzone-ul mare
inițial (fără poze) și pătrățica "+ Adaugă" (când există deja poze) — cu
evidențiere vizuală (bordură/fundal honey) cât timp un fișier e tras
deasupra. Cum a fost verificat: `oxlint` curat pe fișier, apoi verificare
live în browser — evenimente `dragover`+`drop` reale (cu `DataTransfer`
construit programatic, drag OS real nefiind posibil din mediul de
automatizare) trimise pe ambele zone; confirmat contorul "Poze produs *"
a trecut de la 0/5 la 2/5 după primul drop și la 3/5 după al doilea, cu
miniaturile corespunzătoare randate în grilă.

## Extindere `honeyVarieties.js` — mai multe categorii de fapte, aceleași limite ferme

La cerere explicită, structura de date pentru RAG-ul de soiuri a fost extinsă
de la 7 câmpuri la 19 câmpuri per soi, organizate pe categorii clare:
identificare (`scientificName`, `sourcePlant`), aspect fizic
(`colorAfterCrystallization`, `transparency`, `texture`), comportament
(`crystallizationTime`), profil senzorial (`aroma`, `sweetnessIntensity`),
context de recoltare (`typicalRegions`), utilizare culinară generică
(`culinaryUses`) și context cultural (`culturalNotes`). Plus un nou export
separat, `HONEY_STORAGE_INFO` — condiții de păstrare generale, aplicabile
oricărui soi, nu duplicate de 8 ori în array.

**Limită respectată, verificată automat, nu doar promisă**: interzis ferm,
cerut explicit — nimic despre beneficii de sănătate, efecte terapeutice,
compoziție chimică sau comparații "mai sănătos decât", în niciun câmp.
Verificat cu un regex dedicat peste tot conținutul nou (`sănătate`,
`terapeutic`, `vindecă`, `vitamine`, `minerale`, `beneficiu` etc.) —
`false`, nimic găsit.

**Verificat funcțional** (nu doar sintactic): `findVarietyInfo()` testat
direct — găsește corect soiul din `rawName` ("Miere de salcâm" → returnează
`scientificName: "Robinia pseudoacacia"`, `culinaryUses` complete), găsește
corect și dintr-o mențiune în `rawNotes` ("...miere de mana din pădure" →
`sourcePlant` corect), și întoarce `null` curat pentru un soi inexistent —
niciun caz nou stricat.

Nu am mai rulat un test AI live cu credit real pentru acest fix specific
(cerere explicit de extindere de date, nu de comportament) — regula deja
existentă în prompt ("informația se folosește DOAR ca generalizare tipică,
NICIODATĂ ca fapt cert") se aplică neschimbat peste câmpurile noi, dar
comportamentul efectiv al modelului cu aceste câmpuri suplimentare rămâne
de confirmat la o rulare reală viitoare, dacă se dorește.

## Derapare medicală reală, prinsă la testul live cu câmpurile noi — nu de regex, ci de evaluator

Test live cerut explicit după extinderea `honeyVarieties.js`: `rawName="Miere
de salcâm"`, `rawNotes` gol, poze reale, ca să văd cum folosește modelul
câmpurile noi (`scientificName`, `sourcePlant`, `culinaryUses`,
`colorAfterCrystallization` etc.) în anunțul final.

**Ce a apărut**: caracteristica finală generată de AI includea *"Considerat
unul dintre soiurile de miere cele mai căutate și potențial
hipoalergenice."* — "hipoalergenic" e termen medical/de sănătate, exact
categoria interzisă ferm la cererea anterioară de extindere a fișierului.

**Cum a fost prins — evaluatorul, NU regex-ul meu de verificare.** La runda
finală, evaluatorul a semnalat explicit, cuvânt cu cuvânt: *"introduce o
afirmație de tip marketing/sănătate (hipoalergenic, cel mai căutat) care nu
apare în rawNotes și nu poate fi verificată. Trebuie eliminată..."* —
`needsManualReview` a ieșit corect `true` (grație fix-ului `everApproved`
de mai sus). Regex-ul meu de verificare automată a datelor, rulat înainte
de acest test, NU conținea cuvântul "hipoalergenic" — deci n-ar fi prins
niciodată problema; doar stratul de siguranță de la runtime (evaluatorul) a
funcționat aici, nu verificarea mea statică dinainte.

**Cauza reală, găsită imediat prin verificare, nu presupusă**: halucinația
nu venea din câmpurile noi scrise la cererea anterioară — venea din
`commonNotes`, un câmp care exista dinainte de extindere
(`'unul dintre cele mai căutate soiuri, considerat hipoalergenic'`), pe care
nu l-am re-auditat față de regula strictă "fără claim-uri medicale" cerută
explicit la extindere. L-am scris/verificat doar câmpurile NOI, nu și cele
vechi păstrate ca atare.

**Al doilea caz, găsit la scanarea completă a tuturor celor 8 soiuri**, nu
doar la cel testat: `commonNotes` la **tei** conținea *"asociată tradițional
cu efect calmant, folosită la răceli"* — un claim terapeutic direct
(tratament pentru răceală), mai grav decât primul, netestat live pentru că
soiul din test era salcâmul, nu teiul — găsit doar pentru că am scanat toate
cele 8, nu doar pe cel implicat în test.

**Fix**: ambele `commonNotes` reformulate, fără nimic medical —
salcâm → *"unul dintre cele mai căutate și populare soiuri de miere din
România"*; tei → *"strâns asociată, cultural, cu ceaiul de tei — un obicei
tradițional de consum, mai ales toamna și iarna"* (fapt cultural, nu
justificare terapeutică). Regex-ul de verificare automată extins cu termenii
care au scăpat prima dată: `hipoalergen`, `alergi`, `calmant`, `răceală`,
`gripă`, `digesti`, `imunitar`, `antiseptic`, `cicatriz`.

**Verificare finală**: rulat regex-ul extins pe tot fișierul (toate cele 8
soiuri + `HONEY_STORAGE_INFO`) — `false`, nimic găsit. Sintaxă validă,
server pornit sănătos, cont și produs de test șterse.

## Ton mai natural în titlu/descriere — eliminarea "supliment alimentar"

La cerere explicită, promptul generatorului a fost revizuit pentru un ton
mai cald și mai uman. Ce era: titlul și descrierea semănau cu o listă
tehnică de specificații înșirate ("Produs X - caracteristică, cantitate"),
iar în exemple reale generate anterior apărea termenul "supliment
alimentar" — o categorie legal reglementată în UE pentru etichetare
alimentară, riscantă de atribuit unui produs fără conformare reală. De ce:
promptul original cerea doar "ton cald și autentic" ca instrucțiune vagă,
fără exemple concrete de ton natural vs. listă de fapte, și nu interzicea
explicit niciun termen legal-sensibil.

**Fix, în `aiAnalyzer.js`, `runGenerator`**: adăugat un bloc explicit
"STIL DE SCRIERE" în system prompt — titlu cald dar simplu (nu înșiruit pe
liniuțe ca o etichetă tehnică), descriere de 2-3 propoziții naturale care
ancorează afirmațiile vizuale în sursa lor ("așa cum se vede în poze"),
`characteristics` să nu dubleze cuvânt cu cuvânt ce e deja în descriere, și
interdicție fermă a termenului "supliment alimentar" (înlocuit cu "produs
apicol", "polen natural" etc.). Adăugat și un few-shot nou (polen, context
normal) care ilustrează exact acest ton, înlocuind/completând exemplul
existent (care acoperea doar cazul de context aproape gol).

**Regulă suplimentară, cerută explicit de utilizator**: formulări gen "din
stupină proprie" / "vine direct din stupină" / "de la apicultorul nostru"
implică explicit că furnizorul e apicultor — interzise ca presupunere
implicită, permise DOAR dacă furnizorul a menționat explicit stupina/
apicultura în `rawName`/`rawNotes`. Motivul: furnizorul ar putea la fel de
bine fi un revânzător, nu neapărat apicultor — o afirmație nesusținută
despre proveniență ar fi exact genul de lucru inventat pe care regula
strictă de nehalucinare deja îl interzice, doar aplicată la un caz nou,
mai subtil (implicație de status, nu fapt senzorial).

**Testat live** (nu doar sintactic) — produs real trimis prin
`/api/products/analyze`: `rawName="polen"`, `rawPrice=25`,
`rawQuantity="200g"`, `rawNotes=""` (gol, deliberat, ca să confirm că
"din stupină" NU apare fără mențiune explicită), 2 poze sintetice cu
textură de granule de polen. Rezultat:
- Titlu: *"Polen natural, granule aurii - 200g"* — cald, curat, fără
  "supliment alimentar".
- Descriere: *"Polenul acesta se prezintă în granule aurii-portocalii,
  așa cum se vede în poze, ambalat la 200g. Granulele formează zone mai
  dense pe alocuri, dar culoarea rămâne uniformă pe toată suprafața."* —
  propoziții naturale, ancorate corect, nu listă de specificații.
- "Din stupină" NU apare nicăieri — confirmat corect, pentru că
  `rawNotes` era gol.

**Observație suplimentară, neplanificată**: tool-ul `cauta_produse_similare`
a returnat, ca exemplu de context din catalog, exact un produs vechi rămas
în index dintr-un test anterior, cu titlul *"Polen granule - supliment
alimentar natural, 200g"* — un precedent tentant, cu termenul interzis
chiar în fața modelului. Modelul NU l-a preluat în output-ul final, ceea ce
confirmă live că distincția din prompt ("acest tool e sursă de ton/
vocabular, NU de fapte noi") ține și sub presiune directă a unui exemplu
contrar, nu doar teoretic.

**Problemă separată, găsită incidental în același test, nelegată de
cererea de ton**: evaluatorul a prins corect, în a 3-a rundă de evaluare,
că afirmația "culoarea rămâne uniformă pe toată suprafața" contrazice
pozele (se văd clar 2 nuanțe distincte de granule, galben-auriu și
portocaliu-maro) — dar bugetul de rafinare (`MAX_REFINE_ROUNDS = 2`,
deci 3 evaluări în total) s-a epuizat înainte ca draftul să fie corectat.
Pentru că evaluatorul nu a aprobat niciodată draftul în cele 3 runde,
`everApproved` a rămas `false`, deci `needsManualReview: true` — plasa de
siguranță documentată mai sus (safety-net final + fix-ul `everApproved`)
a funcționat exact cum trebuie: produsul NU a fost aprobat fals, a fost
marcat corect pentru revizuire manuală. Nu a fost nevoie de nicio
intervenție — comportament corect al arhitecturii existente sub o eroare
factuală reală, doar semnalat aici ca observație, nu ca bug reparat.

**Verificare finală**: produsul de test șters din DB după verificare
(`DELETE /api/products/:id`, status 204), imaginile sintetice generate nu
au rămas pe disc după ștergere.

## Checkout complet: adresă de livrare + plată cu cardul (Stripe, mod test)

La cerere explicită, checkout-ul a fost extins de la "informativ" la un flux
real de finalizare a comenzii, în 2 etape.

**Etapa 1 — adresă de livrare + alegere metodă de plată.** Ce era:
`Cart.jsx` afișa doar un bloc static "Livrare & plată" cu text informativ
("Livrare prin curier...", "Plată ramburs, direct la curier"), fără niciun
câmp real — comanda se plasa fără adresă. Fix: formular real (nume
destinatar, adresă, telefon), validat și pe server (`orders.js`, 400 dacă
lipsește oricare), plus alegere explicită între "Ramburs" și "Card", radio
buttons, stocate pe fiecare comandă (`shipping_name`, `shipping_address`,
`shipping_phone`, `payment_method` — coloane noi pe `orders`, migrare
defensivă `PRAGMA table_info` + `ALTER TABLE`, la fel ca restul schemei).
Testat live: comandă reală plasată, verificat direct în DB că diacriticele
se salvează corect (testul inițial prin `curl -d` inline arăta "Bucure?ti"
— confirmat că era un artefact de encoding al shell-ului de test, nu un bug
al aplicației, retestat cu body trimis dintr-un fișier UTF-8 și separat
prin formularul real din browser, ambele corecte).

**Etapa 2 — plata cu cardul, cerută explicit ca "online", nu doar
înregistrată.** Aici a fost nevoie de o discuție de scop clară înainte de
implementare: "plată online reală" poate însemna bani reali (refuzat ferm —
neadecvat pentru un prototip demonstrativ) sau o simulare realistă, fără
bani reali. S-a ales **Stripe Checkout, mod
test** — motivul concret: Stripe găzduiește el însuși formularul de card
(pagină separată, `checkout.stripe.com`), deci aplicația noastră NU
colectează, nu vede și nu stochează niciodată date de card — elimină orice
risc de conformare PCI-DSS pe care l-ar fi avut un formular de card
construit de noi. Cheia de test (`sk_test_...`) a fost furnizată de
utilizator, dintr-un cont Stripe propriu, salvată în `server/.env`
(`STRIPE_SECRET_KEY`, opțională — lipsa ei doar dezactivează cardul cu
503, ramburs funcționează neschimbat).

**Arhitectura fluxului de plată**, în `routes/orders.js`:
1. `POST /orders/checkout-session` — validează coș + adresă, construiește
   `line_items` din produsele reale (preț × cantitate, monedă RON),
   creează o sesiune Stripe Checkout cu `success_url`/`cancel_url` înapoi
   în aplicație și `metadata` (buyerId, adresă, itemi) — NU creează
   comanda încă, doar sesiunea de plată.
2. `GET /orders/confirm-session` — apelată de pagina de succes după
   redirect; verifică DIRECT cu Stripe (`sessions.retrieve`) că
   `payment_status === 'paid'`, NU are încredere doar în faptul că
   userul a ajuns pe URL-ul de succes (un redirect se poate falsifica,
   un răspuns de la Stripe verificat server-to-server nu). Abia după
   confirmare creează comanda, cu `payment_method: 'card'` și
   `stripe_session_id` salvat pentru idempotență.
3. `POST /orders` (ramburs) rămâne neschimbată — comandă creată direct,
   fără Stripe, exact ca înainte de această extindere.

**Testat live, capăt la capăt, nu doar la nivel de API:**
- Sesiune Stripe reală creată, sumă și monedă corecte (RON, verificat pe
  pagina Stripe însăși — "RON 70.00" pentru 2×35 RON)
- Plată completă în browser real, cu cardul de test Stripe
  (`4242 4242 4242 4242`) — comandă creată corect după confirmare, cu
  `payment_method: 'card'`, vizibilă în "Comenzile mele"
- **Idempotență verificată**: reîncărcarea paginii de succes cu același
  `session_id` NU a creat o a doua comandă (verificat direct în DB — tot
  1 rând)
- **Cazul negativ verificat**: `confirm-session` apelat pe o sesiune
  NEplătită → respins cu 402, **zero** comenzi create (verificat direct
  în DB) — plasa de siguranță funcționează, nu doar pe fericitul caz de
  succes

**Ce NU face acest flux, deliberat**: nu procesează bani reali (mod test
Stripe explicit), nu implementează webhook-uri Stripe (verificarea
sincronă la întoarcerea userului e suficientă pentru un demo local, fără
server public accesibil de Stripe pentru webhook real oricum).

## Stoc pe produs + oprire manuală a vânzării

La cerere explicită, furnizorul poate acum seta un număr de bucăți în
stoc pe fiecare produs și poate opri manual vânzarea, indiferent de stoc.

**Schema**: 2 coloane noi pe `products` — `stock_quantity` (INTEGER,
nullabil — `NULL` înseamnă stoc nelimitat/nespecificat, nu zero) și
`stock_paused` (INTEGER, boolean, implicit 0). Migrare defensivă identică
cu restul schemei (`PRAGMA table_info` + `ALTER TABLE`).

**Decizie de implementare notabilă**: `PATCH /products/:id` folosea peste
tot tiparul `COALESCE(?, coloană)` pentru actualizări parțiale — dar
`stockQuantity: null` (revenire la stoc nelimitat) și `stockPaused: false`
(repornire vânzare) sunt valori explicite și valide, nu "lipsă valoare".
`COALESCE` le-ar fi tratat greșit ca "nu s-a trimis nimic", păstrând
valoarea veche în loc s-o suprascrie. Rezolvat cu distincție explicită în
JS, pe baza lui `undefined` (câmp neatins de formular) vs. `null`/`false`
(valoare trimisă intenționat), înainte de query.

**Aplicare la comandă, nu doar cosmetic**: un produs oprit sau cu stoc
insuficient nu poate fi comandat, verificat în AMBELE fluxuri de plată
(ramburs și Stripe) printr-un singur helper (`isOrderable`), ca regula să
nu se poată dezalinia între cele două căi. Stocul scade automat la fiecare
comandă reușită — altfel numărul afișat furnizorului ar rămâne decorativ,
fără legătură cu ce se întâmplă real.

**Testat live, capăt la capăt**:
- Stoc setat (3 bucăți) pe un produs real, din "Produsele mele" — salvat corect
- Vânzare oprită pe alt produs → badge "Stoc epuizat" confirmat pe
  marketplace, pentru un vizitator neautentificat, cu butonul "Adaugă în
  coș" dezactivat
- Comandă directă (API) pe produsul oprit → respinsă (400)
- Comandă peste stocul disponibil (5 cerute din 3 disponibile) → respinsă (400)
- Comandă validă (2 din 3) → acceptată (201), stoc verificat direct în DB:
  scăzut corect la 1

## Curățenie finală

La verificare explicită ("verifica peste tot"), găsit și reparat:
`DEBUG_EVALUATOR_COST` (flag opțional de depanare, folosit deja în
`aiAnalyzer.js` pentru a loga costul de tokeni al evaluatorului) nu era
documentat în `.env.example` — aceeași categorie de problemă ca
`CLIENT_ORIGIN`, găsită mai devreme. Adăugat, cu explicație.

Șters și un produs de test rămas de dinainte de fix-ul de ton (titlu cu
"supliment alimentar", duplicat vizual cu alt produs de polen deja
corect), plus 3 produse rămase în starea de ciornă/nerevizuit din testări
anterioare — nu erau vizibile pe marketplace-ul public (doar produsele
publicate apar acolo), dar aglomerau "Produsele mele" ale furnizorilor.

## AI-ul nu știa ce dată e "azi" — marca ani corecți ca fiind "din viitor"

Găsit de utilizator direct în browser (nu la un audit de cod), pe un
produs real: furnizorul a scris în note "recoltata in anul 2026", iar
`confidenceNotes` generat de AI zicea: *"Anul de recoltare indicat (2026)
pare neobișnuit/posibil eronat, fiind un an viitor"*. 2026 e însă anul
curent real, nu unul viitor.

**Cauza reală**: niciun prompt (generator sau evaluator) nu primea vreo
referință la data curentă reală. Modelul raționează despre "azi" pe baza
datei limită de antrenare — orice an/lună de după acel prag e tratat
implicit ca "suspect" sau "din viitor", chiar dacă în realitate e
perfect normal (data reală curentă a depășit deja acel prag). Un bug
subtil, care ar fi afectat orice produs cu o dată recentă menționată de
furnizor — nu doar acest caz particular.

**Fix**: injectată data curentă reală a serverului (`new Date()`,
formatată în română) explicit în AMBELE prompturi — generatorul (scrie
`confidenceNotes`) și evaluatorul (verifică plauzibilitatea) — cu
instrucțiune explicită: o dată nu e suspectă doar pentru că depășește ce
"știa" modelul din antrenare, doar dacă e clar imposibilă sau mult după
data reală curentă.

**Testat live, capăt la capăt**: retrimis un produs cu exact aceleași
informații brute care au expus problema (`rawName: "salcam"`,
`rawNotes: "recoltata in anul 2026"`) — rezultat după fix: titlul include
natural "recoltă 2026", descrierea menționează "din recolta anului 2026"
fără nicio ezitare, iar `confidenceNotes` semnalează doar problema reală,
neînrudită (poze sintetice, nu fotografii reale) — nimic despre anul
fiind suspect. Produsul original al utilizatorului, cu textul vechi,
rămâne needitat (e o ciornă, nepublicată) — poate fi reîncercat oricând
din UI ca să primească și el textul corectat.

## Descriere structurată în 3 părți + eliminarea ambalajului din text

La cerere explicită, promptul generatorului a fost extins ca descrierea să
aibă până la 3 părți, în același câmp `description` (paragrafe separate
prin `\n\n`, nu câmpuri JSON noi — fără schimbare de schemă în DB):
1. paragraful principal (obligatoriu) — despre produs, NICIODATĂ ambalaj
2. "Despre acest soi:" (opțional, doar dacă `obtine_info_soi` a găsit ceva)
3. "Cum se folosește:" (opțional, STRICT culinar — din `culinaryUses`
   al soiului, dacă există; interzis ferm orice beneficiu de sănătate)

Trei straturi de aplicare, nu doar promptul: (1) generatorul primește
instrucțiuni + un exemplu nou de few-shot care demonstrează toate 3
secțiunile; (2) evaluatorul primește un al 7-lea criteriu care verifică
explicit absența ambalajului din paragraful principal și absența
limbajului medical din "Cum se folosește"; (3) `validateListing()`
(fără AI) primește 2 regex noi, ca backstop final: `MEDICAL_LANGUAGE`
(reia + extinde lista găsită la incidentul cu "hipoalergenic") și
`PACKAGING_IN_DESCRIPTION`, aplicat STRICT pe paragraful principal (tot
ce e înainte de primul marker de secțiune).

Pe partea de client, `ProductDetail.jsx` a primit `whitespace-pre-line`
pe paragraful de descriere — fără asta, `\n\n` s-ar fi comprimat în HTML
și toate cele 3 secțiuni ar fi arătat ca un singur bloc de text, lipit.

**Testat live pe toate cele 8 categorii existente** (polifloră, salcâm,
tei, mană, floarea-soarelui, polen, propolis, ceară) — 2 probleme reale
găsite și reparate pe parcurs:

1. **Eșec de JSON tăiat la mijloc (salcâm)** — al 3-lea episod al
   aceluiași bug documentat de 2 ori mai devreme (thinking-ul adaptiv
   consumă din bugetul de `max_tokens`); descrierile în 3 paragrafe sunt
   mai lungi, bugetul de 5000 a devenit din nou insuficient. Fix: mărit
   la 7000. Retestat cu exact aceleași informații brute care au expus
   eșecul — succes, JSON complet.

2. **Fals-pozitiv de validare (tei)** — modelul adăuga clarificări
   redundante în paranteze la caracteristicile hedge-uite (ex:
   "(generalizare de soi, neconfirmată din poză)"), care declanșau din
   greșeală regex-ul existent `MISSING_INFO_AS_CHARACTERISTIC` (căuta
   substring-ul "neconfirmat", gândit inițial pentru "preț neconfirmat",
   nu pentru propriul hedging al modelului). Fix: prompt actualizat —
   hedging DOAR cu prefixul "De regulă, ...", fără paranteze
   suplimentare (informația e deja în confidenceNotes). Retestat —
   caracteristicile ies curate, fără fals-pozitiv.

**Ce a funcționat corect din prima**, pe toate 8 categoriile: zero
scurgeri de limbaj medical (niciodată nevoie ca noul regex să intervină);
"Cum se folosește" mereu ancorat exact în `culinaryUses` din
`honeyVarieties.js`, nimic inventat; secțiunile opționale omise corect
pentru polen/propolis/ceară (fără date de soi în baza de cunoștințe);
backstop-ul `PACKAGING_IN_DESCRIPTION` a prins de 2 ori (tei, floarea-
soarelui) mențiuni de etichetă/borcan strecurate în paragraful principal
— nu au scăpat nesemnalate, produsele au rămas cu `needsManualReview: true`
în loc să fie aprobate fals.

## Gap de acces pe `GET /products/:id` — găsit la o analiză finală, reparat

La o trecere finală de verificare a întregii aplicații (nu legată de o
funcționalitate nouă), am observat că `GET /products/:id` întorcea conținutul
complet al oricărui produs — inclusiv `draft`/`pending_review` — pentru
orice cerere, autentificată sau nu, atâta timp cât id-ul (UUID) era
cunoscut. Frontend-ul public (`Marketplace.jsx`) nu era afectat, pentru că
filtrează explicit `status=published` la fiecare cerere, dar ruta de API
în sine nu impunea nimic — un produs nepublicat era vizibil oricui i-ar fi
ghicit sau aflat id-ul.

Fix: ruta întoarce acum 404 pentru un produs ne-publicat, cu excepția
furnizorului proprietar (`req.user.id === supplier_id`, exact tiparul deja
folosit de `requireOwner` pe PATCH/publish/unpublish) sau a unui admin.
Verificat live: cerere neautentificată pe un produs `draft` → 404; pe un
produs `published` → 200 neschimbat; verificat că nu există produse vechi
cu `supplier_id NULL` în starea curentă a bazei care ar fi rămas needitabile.

## Limbaj tehnic în panoul de transparență AI, semnalat de un utilizator real

Panoul "De ce arată așa anunțul?" din `SupplierReview.jsx` (jurnalul
agentului, vezi mai sus) folosea etichete tehnice pentru fiecare pas —
`A apelat tool-ul "cauta_produse_similare"`, `Validare automată (fără AI)`.
Semnalat direct: un furnizor real e apicultor, nu dezvoltator — jargonul de
implementare (tool-uri, validare) nu comunică nimic util, doar sună confuz.

Decizie inițială: panoul rămâne (are valoare reală — transparență, dovadă
că pipeline-ul chiar face ce spune), dar etichetele sunt reformulate în
limbaj uman, per tool (`cauta_produse_similare` → "A verificat produse
asemănătoare deja publicate...", `obtine_info_soi` → "A căutat informații
generale despre soiul de miere menționat", etc.), păstrând numele
tool-urilor doar ca chei interne de mapare, nu afișate. Verificat live, cu
un produs de test real (7 pași: 2 tool-uri, generare draft, evaluator,
validare finală) — niciun text tehnic rămas vizibil.

**Revizuit din nou, la un produs real cu 21 de pași**: chiar și reformulat
în limbaj uman, un jurnal de 21 de rânduri (câteva runde de rescriere +
tool-uri repetate) tot arată copleșitor pentru un apicultor care doar vrea
să publice un anunț — lungimea variabilă a listei, nu doar vocabularul, era
problema. Decizie finală: panoul (`AgentLogPanel`) și tot ce ține de el au
fost scoase complet din `SupplierReview.jsx` — furnizorul vede doar
conținutul final, editabil, fără jurnalul agentului. Titlul paginii a fost
simplificat de la "Verifică anunțul generat automat" la "Verifică anunțul",
din același motiv — furnizorul nu are nevoie să știe mecanismul, doar
rezultatul pe care îl poate edita. Transparența procesului agentic rămâne
documentată aici, în `DECISIONS.md`, nu în UI-ul furnizorului.

## Ce am lăsat deliberat simplu

- Storage local pentru poze, nu extern (S3 etc.)
- Ramburs = comandă înregistrată direct, fără procesare externă (neschimbat de la început)
- Card = plată reală procesată prin Stripe Checkout, dar în mod TEST — fără bani reali (vezi secțiunea dedicată mai jos; inițial cardul era doar o alegere înregistrată, fără procesare, extins ulterior la cerere explicită)
- Fără notificări (email/push) la schimbare de status
