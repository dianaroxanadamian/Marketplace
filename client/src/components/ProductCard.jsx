import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ASSET_BASE } from '../api';
import Hex from './Hex';
import { useMotionPresets } from '../lib/motion';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export default function ProductCard({ product }) {
  const { fadeInUp, cardHover } = useMotionPresets();
  const { user } = useAuth();
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  const unavailable = product.stock_paused || product.stock_quantity === 0;

  const addToCart = (e) => {
    // Cardul întreg e un link către pagina de produs — fără preventDefault/
    // stopPropagation aici, click-ul pe buton ar naviga în loc să adauge în coș.
    e.preventDefault();
    e.stopPropagation();
    add(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <motion.div
      variants={fadeInUp}
      {...cardHover}
      className="group flex flex-col overflow-hidden rounded-2xl border border-hive-700/60 bg-hive-800 hover:border-honey-500/50 hover:shadow-[0_0_0_1px_rgba(232,169,59,0.25)]"
    >
      <Link to={`/produs/${product.id}`} className="flex flex-1 flex-col">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-hex-grid bg-hive-900">
          {product.imagePaths.length > 0 ? (
            <img
              src={`${ASSET_BASE}${product.imagePaths[0]}`}
              alt={product.ai_title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            // Fără poză (ex. produse fără fotografie potrivită încă) — hexagon
            // discret în loc de imagine spartă, în stilul vizual al paginii.
            <svg width="48" height="56" viewBox="0 0 56 66" className="text-honey-500/30" aria-hidden="true">
              <path d="M28 0L56 16.5V49.5L28 66L0 49.5V16.5Z" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-3 p-5 pb-0">
          <div className="flex items-center gap-2">
            <Hex className="self-start">{product.ai_category}</Hex>
            {unavailable && (
              <span className="rounded-full bg-red-900/30 px-2 py-0.5 text-[11px] text-red-300">Stoc epuizat</span>
            )}
          </div>
          <h3 className="font-display text-xl font-semibold leading-snug text-cream">
            {product.ai_title}
          </h3>
          <p className="line-clamp-2 text-sm text-muted">{product.ai_description}</p>
        </div>
      </Link>

      {/* Sub link-ul cardului, nu în el — un <button> imbricat într-un <a>
          ar fi HTML invalid (conținut interactiv în conținut interactiv) și
          ar naviga înainte să apuce să adauge în coș. */}
      <div className="mt-auto flex items-center justify-between gap-3 p-5 pt-3">
        <div className="min-w-0">
          <span className="block font-mono text-base text-honey-400">
            {product.raw_price ? `${product.raw_price} RON` : 'Preț la cerere'}
          </span>
          <span className="block text-xs text-muted">{product.raw_quantity || ''}</span>
        </div>
        {(!user || user.role === 'buyer') && (
          <button
            onClick={addToCart}
            disabled={unavailable}
            className="shrink-0 rounded-full bg-honey-500 px-4 py-2 text-xs font-semibold text-hive-950 transition-colors hover:bg-honey-400 disabled:cursor-not-allowed disabled:bg-hive-700 disabled:text-muted"
          >
            {unavailable ? 'Stoc epuizat' : added ? 'Adăugat ✓' : 'Adaugă în coș'}
          </button>
        )}
      </div>
    </motion.div>
  );
}
