import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { api, ASSET_BASE } from '../api';
import ProductCard from '../components/ProductCard';
import Hex from '../components/Hex';
import ScrollRevealText from '../components/ScrollRevealText';
import FAQAccordion from '../components/FAQAccordion';
import { useMotionPresets } from '../lib/motion';

const FEATURED_COUNT = 5;

// size/font pe rând — ierarhie vizuală, nu totul la fel: rândurile-cheie
// (deschidere, închidere) mai mari și în font-display (Fraunces, editorial),
// rândurile de context/tranziție mai mici și în font-body (sans, cel folosit
// deja pentru text secundar în restul aplicației). Cuvintele cu încărcătură
// de încredere (verificat/reale/exact) ies în evidență: italic + honey-400,
// indiferent de culoarea animată a rândului (span-ul își setează culoarea
// explicit, așa că nu moștenește tranziția muted→cream a paragrafului).
const BRAND_LINES = [
  { text: 'Nu e miere de raft.', size: 'text-4xl md:text-6xl', font: 'font-display' },
  { text: 'E miere cu un nume și o adresă în spate.', size: 'text-2xl md:text-4xl', font: 'font-body' },
  { text: 'Fiecare borcan, urmărit până la stupul lui.', size: 'text-3xl md:text-5xl', font: 'font-display' },
  {
    text: <>Fiecare furnizor e <span className="italic text-honey-400">verificat</span>, nu doar aprobat automat.</>,
    size: 'text-3xl md:text-5xl', font: 'font-display',
  },
  {
    text: <>Fotografiile sunt <span className="italic text-honey-400">reale</span>, direct din stupină.</>,
    size: 'text-2xl md:text-4xl', font: 'font-body',
  },
  { text: 'Anunțul se scrie din ce vezi în poze, nu din povești inventate.', size: 'text-2xl md:text-4xl', font: 'font-body' },
  {
    text: <>Ce vezi e <span className="italic text-honey-400">exact</span> ce primești.</>,
    size: 'text-4xl md:text-6xl', font: 'font-display',
  },
];

export default function Marketplace() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState([]);
  // Fără el, un backend picat lăsa grid-ul blocat pe "Se încarcă..." la
  // nesfârșit — niciuna din cele 3 cereri de mai jos nu avea .catch() înainte,
  // găsit citind codul, nu presupus. retryCount e în deps la ambele efecte,
  // ca butonul de reîncercare de mai jos să repornească toate cererile.
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const { staggerContainer, fadeInUp, dropIn } = useMotionPresets();

  // Rulare automată a rândului "Colecția noastră", fără să aștepte
  // interacțiune de la vizitator — cerută explicit. Se oprește la
  // hover/atingere (featuredPaused), ca utilizatorul să poată da totuși
  // click pe un card fără să "lupte" cu mișcarea; requestAnimationFrame,
  // nu setInterval, pentru o deplasare continuă, nu în salturi.
  const featuredScrollRef = useRef(null);
  const [featuredPaused, setFeaturedPaused] = useState(false);

  useEffect(() => {
    const el = featuredScrollRef.current;
    if (!el || featured.length === 0) return;
    let raf;
    const step = () => {
      if (!featuredPaused) {
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll > 0) {
          // la capăt, reia de la început — un reset simplu, nu o buclă
          // perfect continuă (ar fi cerut duplicarea itemilor în DOM),
          // dar cu doar 5 carduri "sare" rar, o dată la o rundă completă
          el.scrollLeft = el.scrollLeft >= maxScroll - 1 ? 0 : el.scrollLeft + 0.6;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [featured, featuredPaused]);

  useEffect(() => {
    const failMsg = 'Nu am putut încărca produsele — verifică dacă serverul rulează.';
    api.getCategories().then(setCategories).catch(() => setError(failMsg));
    // "Colecția noastră" — cele mai recent publicate produse (API-ul sortează
    // deja după created_at DESC), independent de filtrele grid-ului principal
    api.getProducts({ status: 'published' })
      .then((data) => setFeatured(data.slice(0, FEATURED_COUNT)))
      .catch(() => setError(failMsg));
  }, [retryCount]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = { status: 'published' };
    if (activeCategory) params.category = activeCategory;
    if (search) params.search = search;
    api.getProducts(params)
      .then((data) => {
        setProducts(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Nu am putut încărca produsele — verifică dacă serverul rulează.');
        setLoading(false);
      });
  }, [activeCategory, search, retryCount]);

  return (
    <div>
      {/* Hero: teza vizuală — fagurele ca structură, mierea ca produs al muncii colective */}
      <section className="relative flex min-h-[85vh] flex-col justify-center overflow-hidden bg-hex-grid md:min-h-[90vh]">
        {/* glow amber difuz, ambiental, în spatele titlului — nu pe text (neatins) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-honey-500/40 blur-[110px] animate-glow"
        />

        {/* 2 particule discrete, gen polen — plutire lentă, amplitudine mică (nu o compoziție încărcată) */}
        <div aria-hidden="true" className="pointer-events-none absolute left-[20%] top-[30%] h-2 w-2 rounded-full bg-honey-400/70 blur-[1px] animate-float [animation-delay:0s]" />
        <div aria-hidden="true" className="pointer-events-none absolute left-[65%] top-[68%] h-1.5 w-1.5 rounded-full bg-honey-300/60 blur-[1px] animate-float [animation-delay:3.5s]" />

        <div className="relative mx-auto grid w-full max-w-[1600px] grid-cols-1 items-center gap-12 px-6 py-24 md:-mt-10 md:grid-cols-[528px_1fr] md:py-32">
          {/* Coloana de text e fixată la 528px — exact lățimea pe care o avea
              în layout-ul original (max-w-6xl, 2 coloane egale) — ca textul
              să arate/să se rupă pe linii identic cu înainte. Mascotă:
              indiferent cât de mare devine imaginea din coloana alăturată, nu
              poate ajunge peste text, pentru că grid-ul nu lasă coloanele să
              se suprapună (spre deosebire de o poziționare absolută/bleed,
              testată și respinsă mai devreme, tocmai din cauza asta). Cade de
              sus și se așază (dropIn), apoi plutește ușor la nesfârșit
              (animate-float-solid, pe wrapper — nu pe imagine, ca să nu intre
              în conflict cu transform-ul spring; variantă fără puls de
              opacitate a lui `animate-float` — acela era gândit pentru
              particule mici și o făcea pe mascotă să pară permanent
              decolorată, oscilând între 35% și 75% opacitate). Halou auriu
              mai intens + saturate/contrast crescute, ca mascota să iasă
              clar pe fundalul închis. */}
          {/* Text ÎNAINTE de mascotă în DOM — pe mobil (fără md:order activ)
              se randează în ordinea din sursă, deci textul apare primul,
              mascota după (cerut explicit: albina doar după text, nu
              deasupra). Pe desktop, md:order-1/md:order-2 repoziționează
              independent de ordinea din DOM, deci layout-ul din grid
              (text stânga, mascotă dreapta) rămâne neschimbat. */}
          <div className="md:order-1 md:pl-12">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-honey-500">
              Direct de la stupină
            </p>
            <h1 className="font-display bg-text-shine bg-[length:250%_100%] bg-[position:200%_0] bg-clip-text text-7xl font-semibold !leading-[0.95] text-transparent transition-transform duration-500 ease-out hover:scale-[1.02] hover:animate-text-shine-hover md:text-8xl">
              Fiecare borcan are<br />
              o poveste de spus.
            </h1>
            <p className="mt-6 max-w-xl text-muted">
              De la stupină direct la tine — fiecare produs vine cu numele apicultorului
              care l-a făcut, verificat înainte să ajungă public.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#produse"
                className="inline-flex items-center gap-2 rounded-full bg-honey-500 px-6 py-3 font-mono text-sm uppercase tracking-[0.2em] text-hive-950 transition-colors hover:bg-honey-400"
              >
                Descoperă mierea
                <span aria-hidden="true">→</span>
              </a>
              <Link
                to="/inregistrare"
                className="inline-flex items-center gap-2 rounded-full border border-hive-700 px-6 py-3 text-sm font-medium text-cream transition-colors hover:border-honey-500 hover:text-honey-300"
              >
                Ești apicultor? Adaugă primul tău produs
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          <div className="flex justify-center md:order-2 md:justify-end">
            <div className="relative w-full max-w-[620px] animate-float-solid">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 scale-150 rounded-full bg-honey-400/65 blur-[130px] animate-glow [animation-delay:2s]"
              />

              {/* Polen — 3 particule mici, discrete, doar în jurul mascotei
                  (nu în tot hero-ul, ca cele 2 de mai sus). Reuse `animate-float`
                  intenționat aici — pulsul lui de opacitate (0.35↔0.75) e exact
                  senzația de "apare și dispare" cerută, spre deosebire de
                  `float-solid` (fără puls), folosit pe elemente mari/la vedere. */}
              <div aria-hidden="true" className="pointer-events-none absolute left-[8%] top-[12%] h-1.5 w-1.5 rounded-full bg-honey-300/80 blur-[0.5px] animate-float [animation-delay:0.5s]" />
              <div aria-hidden="true" className="pointer-events-none absolute right-[6%] top-[38%] h-2 w-2 rounded-full bg-honey-400/70 blur-[0.5px] animate-float [animation-delay:2.8s]" />
              <div aria-hidden="true" className="pointer-events-none absolute left-[14%] bottom-[10%] h-1.5 w-1.5 rounded-full bg-honey-300/70 blur-[0.5px] animate-float [animation-delay:5.2s]" />

              {/* mascot-bee.png a fost decupată (trim) la conținutul real —
                  originalul avea multă margine transparentă în jurul albinei,
                  ceea ce o făcea să pară mică indiferent cât de mare era
                  cutia. Acum imaginea e aproape numai albină. */}
              {/* Wobble (rotație ±2°, 5.5s) pe un wrapper propriu, separat de
                  float-solid (translateY, wrapper-ul de mai sus) și de spring-ul
                  framer-motion de pe <motion.img> (dropIn, translateY+opacity) —
                  3 transform-uri pe 3 elemente diferite, ca să se compună vizual
                  în loc să se suprascrie unul pe altul (CSS/inline transform nu
                  se adună pe același element). */}
              <div className="animate-wobble">
                <motion.img
                  src="/mascot-bee.png"
                  alt="Mascota Fagure — albinuță pe borcan de miere"
                  {...dropIn}
                  className="relative w-full max-w-[620px] saturate-[1.7] contrast-[1.18] brightness-[1.1] drop-shadow-[0_25px_60px_rgba(232,169,59,0.5)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* fade difuz spre fundal, în loc de linie dură sub hero */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-hive-950" />
      </section>

      {/* Colecția noastră — teaser orizontal cu scroll, stil editorial (poză
          mare, text minim dedesubt), separat de grid-ul principal de mai jos.
          Mutată imediat după hero — conținutul real (produse) vine înainte
          de secțiunile de brand/poveste, nu după 3-4 din ele. */}
      {featured.length > 0 && (
        <section className="border-t border-hive-800 bg-hive-950 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="font-display text-3xl font-semibold text-cream md:text-4xl">Colecția noastră</h2>
            <p className="mt-2 text-muted">Cele mai recente adăugiri, direct de la furnizori.</p>
          </div>

          <motion.div
            ref={featuredScrollRef}
            onMouseEnter={() => setFeaturedPaused(true)}
            onMouseLeave={() => setFeaturedPaused(false)}
            onTouchStart={() => setFeaturedPaused(true)}
            onTouchEnd={() => setFeaturedPaused(false)}
            className="mt-10 flex gap-6 overflow-x-auto px-6 pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={staggerContainer}
          >
            {featured.map((p) => (
              <motion.div key={p.id} variants={fadeInUp} className="w-64 shrink-0 snap-start sm:w-72">
                <Link to={`/produs/${p.id}`} className="group block">
                  <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl bg-hex-grid bg-hive-800">
                    {p.imagePaths.length > 0 ? (
                      <img
                        src={`${ASSET_BASE}${p.imagePaths[0]}`}
                        alt={p.ai_title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <svg width="40" height="46" viewBox="0 0 56 66" className="text-honey-500/30" aria-hidden="true">
                        <path d="M28 0L56 16.5V49.5L28 66L0 49.5V16.5Z" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    )}
                  </div>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-honey-500">{p.ai_category}</p>
                  <h3 className="font-display text-lg text-cream">{p.ai_title}</h3>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </section>
      )}

      {/* Text de brand + "Promisiunea noastră", unificate într-un SINGUR bloc
          continuu de scroll-reveal — nu mai există secțiune separată cu
          titlu propriu pentru promisiune; rândurile ei sunt pur și simplu
          o continuare a BRAND_LINES, cu același efect de luminare progresivă.
          Imaginea grădinii e integrată lateral, în același bloc sticky (vezi
          prop-urile image/imageAlt din ScrollRevealText.jsx), nu ruptă
          într-o secțiune separată. */}
      <ScrollRevealText
        lines={BRAND_LINES}
        className="bg-hive-950"
        image="/garden-bee.png"
        imageAlt="Albinuța Fagure într-o grădină cu flori"
      />

      <div id="produse" className="mx-auto max-w-6xl px-6 py-16">
        {/* Filtre */}
        <div className="mb-12 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2.5">
            <button onClick={() => setActiveCategory(null)}>
              <Hex filled={!activeCategory}>Toate</Hex>
            </button>
            {categories.map((c) => (
              <button key={c} onClick={() => setActiveCategory(c)}>
                <Hex filled={activeCategory === c}>{c}</Hex>
              </button>
            ))}
          </div>
          <input
            id="search"
            name="search"
            type="text"
            aria-label="Caută un produs"
            placeholder="Caută un produs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-full border border-hive-700 bg-hive-800 px-4 py-2.5 text-sm text-cream placeholder:text-muted focus:border-honey-500 md:w-64"
          />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-900/20 py-16 text-center">
            <p className="text-red-200">{error}</p>
            <button
              onClick={() => setRetryCount((c) => c + 1)}
              className="mt-4 rounded-full bg-honey-500 px-6 py-2 text-sm font-semibold text-hive-950 transition-colors hover:bg-honey-400"
            >
              Reîncearcă
            </button>
          </div>
        ) : loading ? (
          <p className="py-20 text-center text-muted">Se încarcă produsele...</p>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-hive-700 py-20 text-center">
            <p className="text-cream">Niciun produs aici încă.</p>
            <p className="mt-1 text-sm text-muted">
              Fii primul apicultor care își adaugă produsele pe Fagure.
            </p>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={staggerContainer}
          >
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </motion.div>
        )}
      </div>

      {/* Plin-ecran, pauză vizuală după catalog, înainte de FAQ — fade-uri pe
          toate 4 laturile, ca să se contopească natural în hive-950 în loc
          să taie brusc marginile cadrului. */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-hive-900">
        <video
          src="/mascot-video.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-hive-950 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-hive-950" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-hive-950 to-transparent md:w-40" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-hive-950 to-transparent md:w-40" />
      </section>

      {/* FAQ — la finalul paginii principale, accordion simplu */}
      <section className="border-t border-hive-800 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="font-display text-3xl font-semibold text-cream md:text-4xl">Întrebări frecvente</h2>
          <div className="mt-8">
            <FAQAccordion />
          </div>
        </div>
      </section>
    </div>
  );
}
