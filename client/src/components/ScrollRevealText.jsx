import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

// Culorile de mai jos sunt exact valorile din tailwind.config.js
// (muted / cream) — nu paletă nouă, doar hex direct, pentru că
// useTransform interpolează valori brute, nu clase Tailwind.
const MUTED = '#A6926F';
const CREAM = '#F5EDE0';

function RevealLine({ text, size, font, start, end, scrollYProgress }) {
  // 3 puncte, nu 2: [start, end, 1] -> [0.18, 1, 1]. Cu doar [start,end],
  // rândurile timpurii (end mic) reveneau la 0.18 pe măsură ce progresul
  // continua peste `end` — comportament real, confirmat live (nu artefact
  // de test): valorile "rămâneau" corect doar dacă intervalul de input
  // acoperea tot drumul până la 1. Cu al treilea punct, rândul urcă până
  // la `end`, apoi STĂ la maxim (0.18→1→1), niciodată nu mai scade.
  const points = end < 1 ? [start, end, 1] : [start, end];
  const opacity = useTransform(scrollYProgress, points, end < 1 ? [0.18, 1, 1] : [0.18, 1]);
  const color = useTransform(scrollYProgress, points, end < 1 ? [MUTED, CREAM, CREAM] : [MUTED, CREAM]);
  const fontWeight = useTransform(scrollYProgress, points, end < 1 ? [400, 700, 700] : [400, 700]);
  return (
    <motion.p style={{ opacity, color, fontWeight }} className={`${font} ${size} leading-tight`}>
      {text}
    </motion.p>
  );
}

// Imaginea, coloană îngustă în stânga textului — parte din același bloc
// sticky, deci rămâne vizibilă cât timp utilizatorul derulează prin rânduri
// (nu intră/iese ca o secțiune separată). Intrare cu spring (nu doar fade),
// apoi plutire + tilt continuu, foarte lent, plus halou auriu pulsatoriu.
// Totul se oprește la prefers-reduced-motion — imaginea rămâne statică.
function RevealImage({ src, alt, reduced }) {
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={reduced ? { duration: 0.01 } : { type: 'spring', stiffness: 140, damping: 15 }}
      className="flex justify-center"
    >
      <motion.div
        animate={reduced ? {} : { y: [0, -12, 0], rotate: [-2, 2, -2] }}
        transition={reduced ? {} : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative w-full"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 scale-125 rounded-full bg-honey-400/45 blur-[100px] animate-glow"
        />
        <img src={src} alt={alt} className="w-full rounded-3xl shadow-2xl shadow-black/40" />
      </motion.div>
    </motion.div>
  );
}

/**
 * Rânduri de text care trec de la opacitate/culoare estompată la
 * opacitate completă + cream, sincronizat cu progresul REAL de scroll
 * prin secțiune (useScroll + scrollYProgress), nu cu un simplu trigger
 * "a intrat în view". Fiecare rând "se aprinde" într-o felie proprie
 * din progresul total — sub-linii se suprapun puțin, ca tranziția să
 * fie lină — și rămâne "aprins" (nu se stinge la loc) după ce a trecut
 * felia lui.
 *
 * Containerul e mai înalt decât un ecran (lines.length × 70vh), cu
 * textul `sticky` la mijlocul viewport-ului cât timp se derulează prin
 * el — altfel n-ar exista suficient "traseu" de scroll ca efectul să
 * se simtă, ar trece instant.
 *
 * `lines`: array de string SAU de {text, size, font} — size/font permit
 * variație tipografică pe rând (nu toate rândurile la fel), text poate fi
 * JSX (ex. cuvinte accentuate cu <span className="italic text-honey-400">).
 *
 * image/imageAlt (opțional): când sunt date, textul + imaginea împart
 * același bloc sticky (imaginea într-o coloană îngustă, ~1/3, în stânga
 * textului, care ocupă restul) — nu mai e o secțiune separată.
 */
export default function ScrollRevealText({ lines, className = '', image, imageAlt }) {
  const containerRef = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const normalized = lines.map((l) =>
    typeof l === 'string' ? { text: l, size: 'text-3xl md:text-5xl', font: 'font-display' } : l
  );
  const n = normalized.length;
  const overlap = 0.4; // cât se suprapun ferestrele de tranziție a rândurilor consecutive

  const textBlock = (
    <div className={`space-y-3 ${image ? '' : 'mx-auto max-w-3xl px-6'}`}>
      {normalized.map((l, i) => {
        if (reduced) {
          return (
            <p key={i} className={`${l.font} ${l.size} leading-tight`} style={{ color: CREAM }}>
              {l.text}
            </p>
          );
        }
        const start = Math.max(0, i / n - overlap / n);
        const end = Math.min(1, (i + 1) / n);
        return (
          <RevealLine key={i} text={l.text} size={l.size} font={l.font} start={start} end={end} scrollYProgress={scrollYProgress} />
        );
      })}
    </div>
  );

  // Layout comun (folosit atât pentru fallback-ul redus-motion, cât și
  // pentru varianta animată): imagine ~1/3, text restul, text-ul lățit
  // (max-w-4xl, nu max-w-3xl îngust) ca rândurile mai mari să respire.
  const withImageLayout = (extra) => (
    <div className={`mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 md:grid-cols-[1fr_2fr] ${extra}`}>
      <div className="md:order-1">
        <RevealImage src={image} alt={imageAlt} reduced={reduced} />
      </div>
      <div className="md:order-2 md:max-w-4xl">{textBlock}</div>
    </div>
  );

  if (reduced) {
    // fără efect legat de scroll — textul apare direct, complet vizibil
    return <div className={className}>{image ? withImageLayout('py-20') : textBlock}</div>;
  }

  return (
    // top-0 + min-h-screen + flex items-center, NU top-1/2 -translate-y-1/2:
    // translate-y e un transform STATIC, aplicat mereu — inclusiv înainte ca
    // elementul să devină efectiv "stuck" — deci muta conținutul în sus cu
    // jumătate din propria înălțime chiar și în flux normal. Cu conținut
    // scurt (3 linii) diferența era mică și trecea neobservată; cu blocul
    // mult mai înalt de-acum (imagine + linii mari), acel decalaj a ajuns
    // ~300px, suficient cât să se suprapună peste secțiunea de dinainte
    // (bug real, prins la testare, confirmat prin măsurători live). Cu
    // top-0, poziția pre-stuck e poziția normală din flux (fără shift
    // fantomă), iar centrarea verticală se face intern, prin flexbox.
    <div ref={containerRef} style={{ height: `${n * 70}vh` }} className={className}>
      {image ? (
        <div className="sticky top-0 flex min-h-screen items-center">{withImageLayout('')}</div>
      ) : (
        <div className="sticky top-0 flex min-h-screen items-center">{textBlock}</div>
      )}
    </div>
  );
}
