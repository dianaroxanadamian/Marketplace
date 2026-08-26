/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        hive: {
          950: '#150F09',
          900: '#1E150C',
          800: '#2B1E11',
          700: '#3D2A16',
          600: '#5A3D1F',
        },
        honey: {
          300: '#F4C766',
          400: '#EDB94A',
          500: '#E8A93B',
          600: '#C98A24',
        },
        cream: '#F5EDE0',
        muted: '#A6926F',
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Work Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'hex-grid': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'%3E%3Cpath d='M28 0L56 16V50L28 66L0 50V16Z' fill='none' stroke='%23E8A93B' stroke-opacity='0.06' stroke-width='1.5'/%3E%3Cpath d='M28 34L56 50V84L28 100L0 84V50Z' fill='none' stroke='%23E8A93B' stroke-opacity='0.06' stroke-width='1.5'/%3E%3C/svg%3E\")",
        // trecere diagonală aurie — folosită doar pe hover, o singură rulare
        // (vezi animation.shimmer, fără `infinite`), pe butonul de publicare
        shimmer: 'linear-gradient(115deg, transparent 35%, rgba(244,199,102,0.45) 50%, transparent 65%)',
        // Bandă de lumină pe textul titlului, la hover — încercarea cu
        // model de fagure în litere (hex-fill) a fost respinsă: prea
        // aglomerat, greu de citit la dimensiune mare de font. Varianta 2
        // (crem dominant, doar o bandă îngustă aurie) a fost considerată
        // prea discretă/prea puțin aurie — acum tot gradientul e în
        // nuanțe de auriu (nu doar cremd cu un vârf auriu), multi-ton:
        // chihlimbariu închis → auriu intens → aproape alb-auriu → înapoi.
        'text-shine': 'linear-gradient(110deg, #C98A24 15%, #F4C766 30%, #FFDD8A 45%, #FFF8E0 50%, #FFDD8A 55%, #F4C766 70%, #C98A24 85%)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-150% 0' },
          '100%': { backgroundPosition: '150% 0' },
        },
        glow: {
          '0%, 100%': { opacity: '0.15', transform: 'scale(1)' },
          '50%': { opacity: '0.32', transform: 'scale(1.12)' },
        },
        // plutire foarte lentă, amplitudine mică — pentru particule decorative
        // discrete (gen polen), nu pentru elemente mari/atenție
        float: {
          '0%, 100%': { transform: 'translateY(0px)', opacity: '0.35' },
          '50%': { transform: 'translateY(-14px)', opacity: '0.75' },
        },
        // aceeași plutire, dar FĂRĂ pulsul de opacitate de mai sus — pentru
        // elemente mari, la vedere (ex. mascota din hero), unde opacitatea
        // oscilantă (0.35-0.75) le face să pară permanent decolorate/spălăcite.
        'float-solid': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        // rotație foarte ușoară, pe un wrapper separat de cel care face
        // float-solid — transform-urile CSS nu se compun pe același element,
        // așa că fiecare mișcare (translateY, rotate, spring-ul framer-motion
        // de pe imagine) stă pe stratul ei din DOM, ca să nu se anuleze reciproc.
        wobble: {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2deg)' },
        },
        // banda de lumină din text-shine "alunecă" la nesfârșit, de la
        // dreapta la stânga — background-size trebuie să fie mult mai mare
        // decât elementul (vezi bg-[length:250%_100%] pe h1), altfel
        // deplasarea de backgroundPosition n-are ce să dezvăluie vizual.
        'text-shine': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        // halou auriu difuz în spatele textului, care respiră (crește/scade)
        // — separat de mișcarea benzii de lumină (perioade diferite,
        // 3.5s vs. 7s), ca cele 2 mișcări să nu pară sincronizate mecanic,
        // ci organice. `filter: drop-shadow` funcționează pe pixelii reali
        // randați (litera decupată prin bg-clip-text), nu pe cutia
        // elementului — un `box-shadow` obișnuit n-ar avea niciun efect
        // aici, pentru că textul propriu-zis e transparent.
        'text-glow': {
          '0%, 100%': { filter: 'drop-shadow(0 0 10px rgba(244,199,102,0.35)) drop-shadow(0 0 24px rgba(244,199,102,0.15))' },
          '50%': { filter: 'drop-shadow(0 0 22px rgba(244,199,102,0.65)) drop-shadow(0 0 44px rgba(244,199,102,0.3))' },
        },
      },
      animation: {
        // o singură trecere, 3.5s — declanșată de clasa `hover:animate-shimmer`,
        // pornește de la 0% la fiecare intrare în hover, nu se repetă (fără infinite)
        shimmer: 'shimmer 3.5s ease-in-out',
        // Varianta "continuă" (rulează mereu) a fost respinsă — cerută
        // din nou ca efect DOAR la hover, ca shimmer-ul de pe buton: o
        // singură trecere, pornește de la 0% la fiecare intrare în hover,
        // nu infinite. 2 animații combinate într-o singură valoare (listă
        // separată prin virgulă în shorthand-ul CSS `animation`) — 2 clase
        // Tailwind separate NU s-ar fi combinat, a doua ar fi suprascris-o
        // pe prima (`animation` e o singură proprietate CSS).
        'text-shine-hover': 'text-shine 1.8s ease-in-out, text-glow 1.8s ease-in-out',
        // glow ambiental continuu, lent — pentru fundalul hero-ului, nu pentru text
        glow: 'glow 8s ease-in-out infinite',
        float: 'float 9s ease-in-out infinite',
        'float-solid': 'float-solid 9s ease-in-out infinite',
        wobble: 'wobble 5.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
