import { useReducedMotion } from 'framer-motion';

// Paletă mică de animații reutilizabile — un singur loc, nu logică
// duplicată în fiecare componentă. Ton discret, consecvent cu restul
// design-ului (fără bounce, fără efecte exagerate).
const EASE = [0.22, 1, 0.36, 1]; // decelerare lină, tip "easeOutExpo"

export const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

// Container pentru un grid/listă — copiii cu variante proprii apar în
// cascadă, nu toți deodată. Se folosește cu `variants={staggerContainer}`
// pe părinte și `variants={fadeInUp}` pe fiecare copil.
export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

// Props gata de spread pe orice <motion.div {...cardHover}> — scale discret,
// nu mai mult de 1.03 (peste asta începe să pară "jucărie").
export const cardHover = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.98 },
  transition: { duration: 0.2, ease: EASE },
};

// Tranziție de pagină — fade + slide vertical minim (12px), folosită cu
// AnimatePresence în jurul rutelor din App.jsx.
export const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.25, ease: EASE },
};

// Intrare/ieșire pentru elemente de listă (ex. rândurile din
// SupplierDashboard) — combinat cu AnimatePresence, ca ștergerea unui
// element să se vadă animat, nu doar să dispară brusc.
export const listItem = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto', transition: { duration: 0.3, ease: EASE } },
  exit: { opacity: 0, x: -32, transition: { duration: 0.25, ease: EASE } },
};

// Intrare unică (nu buclă): elementul "cade" de sus și se așază la locul
// final, cu un mic bounce fizic — folosit pentru mascota din hero. Spring,
// nu keyframe CSS, pentru senzația de greutate/așezare naturală.
export const dropIn = {
  initial: { y: -140, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 120, damping: 12, delay: 0.15 } },
};

// Respectă prefers-reduced-motion la nivel de animații JS (nu doar CSS,
// unde există deja un guard global în index.css) — întoarce aceleași
// variante, dar cu durată ~0 dacă utilizatorul a cerut mișcare redusă.
export function useMotionPresets() {
  const reduced = useReducedMotion();
  if (!reduced) return { fadeInUp, staggerContainer, cardHover, pageTransition, listItem, dropIn };

  const instant = { duration: 0.01 };
  return {
    fadeInUp: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: instant } },
    staggerContainer: { hidden: {}, visible: { transition: { staggerChildren: 0 } } },
    cardHover: { whileHover: {}, whileTap: {}, transition: instant },
    pageTransition: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: instant },
    listItem: { initial: { opacity: 0 }, animate: { opacity: 1, transition: instant }, exit: { opacity: 0, transition: instant } },
    dropIn: { initial: { opacity: 0 }, animate: { opacity: 1, transition: instant } },
  };
}
