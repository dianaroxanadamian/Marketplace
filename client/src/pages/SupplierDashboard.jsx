import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, ASSET_BASE } from '../api';
import { useMotionPresets } from '../lib/motion';

export default function SupplierDashboard() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { listItem } = useMotionPresets();

  const load = () => {
    setLoading(true);
    api.getProducts({ mine: 'true' }).then((all) => {
      setProducts(all);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const togglePublish = async (p) => {
    if (p.status === 'published') await api.unpublishProduct(p.id);
    else await api.publishProduct(p.id);
    load();
  };

  // Stoc editat local, per produs, ca să nu retrimită o cerere la fiecare
  // apăsare de tastă — se trimite doar la blur/Enter (updateStock).
  const [stockDrafts, setStockDrafts] = useState({});
  const stockValue = (p) => stockDrafts[p.id] ?? (p.stock_quantity ?? '');

  const updateStock = async (p, rawValue) => {
    const trimmed = String(rawValue).trim();
    const stockQuantity = trimmed === '' ? null : Math.max(0, parseInt(trimmed, 10) || 0);
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, stock_quantity: stockQuantity } : x)));
    await api.updateProduct(p.id, { stockQuantity });
  };

  const toggleStockPaused = async (p) => {
    const stockPaused = !p.stock_paused;
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, stock_paused: stockPaused } : x)));
    await api.updateProduct(p.id, { stockPaused });
  };

  const STATUS_LABEL = {
    pending_review: { text: 'Nerevizuit încă', className: 'bg-amber-500/20 text-amber-300' },
    draft: { text: 'Ciornă', className: 'bg-hive-700 text-muted' },
    published: { text: 'Publicat', className: 'bg-honey-500/20 text-honey-400' },
  };

  // Important: ștergem elementul DOAR din state-ul local (nu re-fetch complet
  // ca înainte) — altfel, până se termină noul GET, item-ul e deja dispărut
  // din array-ul primit de la server, iar AnimatePresence nu mai apucă să
  // anime nimic (nu există un moment intermediar în care React să vadă
  // "era acolo, acum nu mai e" ca tranziție separată de animație). Cu
  // filtrarea locală, eliminarea e un singur state update sincron, exact ce
  // are nevoie AnimatePresence ca să declanșeze `exit`.
  const remove = async (p) => {
    if (!confirm(`Ștergi definitiv "${p.ai_title}"?`)) return;
    await api.deleteProduct(p.id);
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="font-display text-4xl font-semibold text-cream md:text-5xl">Produsele mele</h1>
      <p className="mt-3 text-muted">Vezi ciornele pregătite automat și produsele deja publicate.</p>

      {loading && <p className="mt-8 text-muted">Se încarcă...</p>}

      {!loading && products.length === 0 && (
        <p className="mt-8 text-muted">Niciun produs încă. Adaugă primul din butonul "Adaugă produs".</p>
      )}

      <div className="mt-10 space-y-3">
        <AnimatePresence initial={false}>
          {products.map((p) => (
            <motion.div
              key={p.id}
              layout
              {...listItem}
              className="flex items-center gap-4 overflow-hidden rounded-xl border border-hive-700/60 bg-hive-800 p-3"
            >
              <img src={`${ASSET_BASE}${p.imagePaths[0]}`} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-cream">{p.ai_title}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_LABEL[p.status]?.className || 'bg-hive-700 text-muted'}`}>
                    {STATUS_LABEL[p.status]?.text || p.status}
                  </span>
                  {p.stock_paused && (
                    <span className="shrink-0 rounded-full bg-red-900/30 px-2 py-0.5 text-[11px] text-red-300">Vânzare oprită</span>
                  )}
                </div>
                <p className="text-xs text-muted">{p.ai_category}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <label htmlFor={`stock-${p.id}`} className="text-xs text-muted">Stoc:</label>
                  <input
                    id={`stock-${p.id}`}
                    type="number"
                    min={0}
                    placeholder="nelimitat"
                    value={stockValue(p)}
                    onChange={(e) => setStockDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    onBlur={(e) => updateStock(p, e.target.value)}
                    className="w-20 rounded-md border border-hive-700 bg-hive-900 px-2 py-1 text-xs text-cream focus:border-honey-500"
                  />
                  <button onClick={() => toggleStockPaused(p)} className="text-xs text-muted hover:text-honey-400">
                    {p.stock_paused ? 'Repornește vânzarea' : 'Oprește vânzarea'}
                  </button>
                </div>
              </div>
              <Link to={`/verifica/${p.id}`} className="shrink-0 text-sm text-muted hover:text-honey-400">Editează</Link>
              <button onClick={() => togglePublish(p)} className="shrink-0 text-sm text-honey-400 hover:text-honey-300">
                {p.status === 'published' ? 'Retrage' : 'Publică'}
              </button>
              <button onClick={() => remove(p)} className="shrink-0 text-sm text-red-400 hover:text-red-300">Șterge</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
