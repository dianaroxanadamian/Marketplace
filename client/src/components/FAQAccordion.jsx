import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1];

const FAQ_ITEMS = [
  {
    q: 'Cum verificăm calitatea furnizorilor?',
    a: 'Fiecare furnizor completează un profil cu date de contact reale. Anunțurile trec printr-un pas de analiză automată, apoi furnizorul le verifică și le editează manual înainte de publicare — nimic nu ajunge public automat. Nu facem încă verificări fizice la stupină; dacă un produs nu corespunde descrierii, ne poți contacta.',
  },
  {
    q: 'Cum e generat automat anunțul?',
    a: 'Furnizorul încarcă 2-5 poze și câteva informații de bază. Pozele și notele sunt analizate automat, iar sistemul propune titlu, descriere, categorie și caracteristici. Furnizorul verifică și poate edita orice câmp înainte de a publica — sau poate completa manual, dacă analiza automată eșuează.',
  },
  {
    q: 'Ce se întâmplă dacă generarea automată eșuează?',
    a: 'Pozele rămân salvate, nimic nu se pierde. Furnizorul poate reîncerca generarea automată cu un click, sau poate completa manual titlul, descrierea și categoria din pagina de verificare.',
  },
  {
    q: 'Pot returna un produs?',
    a: 'Fagure e momentan un prototip local, fără sistem integrat de plată sau retur. Orice comandă și eventuală returnare se discută direct cu furnizorul, folosind datele de contact afișate pe pagina produsului.',
  },
  {
    q: 'Cum contactez un furnizor?',
    a: 'Pe pagina fiecărui produs publicat găsești numele furnizorului și datele lui de contact, chiar sub descriere.',
  },
];

function FAQItem({ item, isOpen, onToggle }) {
  return (
    <div className="border-b border-hive-800">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
        aria-expanded={isOpen}
      >
        <span className="font-display text-lg text-cream">{item.q}</span>
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="shrink-0 text-2xl leading-none text-honey-400"
          aria-hidden="true"
        >
          +
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <p className="pb-5 pr-8 text-muted">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Accordion simplu — un singur răspuns deschis o dată, height animat cu Framer Motion. */
export default function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div>
      {FAQ_ITEMS.map((item, i) => (
        <FAQItem
          key={i}
          item={item}
          isOpen={openIndex === i}
          onToggle={() => setOpenIndex(openIndex === i ? null : i)}
        />
      ))}
    </div>
  );
}
