import { searchSimilarProducts } from './tools/similarProducts.js';
import { findVarietyInfo } from './tools/honeyVarietyLookup.js';
import { CATEGORIES } from './categories.js';

// Registru central de tool-uri: definițiile (schema JSON pe care le vede
// modelul) separate de execuția lor (executeTool), ca runGenerator din
// aiAnalyzer.js să nu știe nimic despre implementarea fiecărui tool —
// doar le trimite modelului și rulează ce cere el înapoi.

export const toolDefinitions = [
  {
    name: 'cauta_produse_similare',
    description:
      'Caută în catalogul existent produse apicole similare (după titlu/descriere/categorie). ' +
      'Folosește acest tool ÎNAINTE de a scrie descrierea finală, ca să păstrezi un ton și un ' +
      'vocabular consistent cu restul marketplace-ului și să nu inventezi caracteristici deja ' +
      'atribuite altui produs.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text scurt care descrie produsul, ex: "miere de salcâm cristalizată"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'obtine_categorii_valide',
    description: 'Returnează lista oficială de categorii permise pe marketplace. Categoria finală trebuie să fie EXACT una din listă.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'obtine_info_soi',
    description:
      'Returnează fapte generale despre un soi de miere (culoare tipică, consistență, gust, ' +
      'cristalizare). Folosește DOAR dacă furnizorul a menționat soiul explicit; NU ghici soiul ' +
      'din poză sau din culoare.',
    input_schema: {
      type: 'object',
      properties: {
        soi: { type: 'string', description: 'Numele soiului, exact cum apare în informațiile brute de la furnizor, ex: "salcâm"' },
      },
      required: ['soi'],
    },
  },
];

export function executeTool(name, input) {
  switch (name) {
    case 'cauta_produse_similare':
      return searchSimilarProducts(input.query);
    case 'obtine_categorii_valide':
      return CATEGORIES;
    case 'obtine_info_soi':
      return findVarietyInfo(input.soi, '') || { gasit: false, mesaj: 'Soi necunoscut în baza de cunoștințe — nu presupune detalii, tratează-l ca nespecificat.' };
    default:
      throw new Error(`Tool necunoscut: ${name}`);
  }
}
