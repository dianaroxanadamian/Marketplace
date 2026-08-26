import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ASSET_BASE } from '../api';
import Hex from '../components/Hex';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);
  const { user } = useAuth();
  const { add } = useCart();

  useEffect(() => {
    api.getProduct(id).then((p) => { setProduct(p); setActiveImage(0); }).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="mx-auto max-w-3xl px-6 py-20 text-center text-muted">{error}</p>;
  if (!product) return <p className="mx-auto max-w-3xl px-6 py-20 text-center text-muted">Se încarcă...</p>;

  const unavailable = product.stock_paused || product.stock_quantity === 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <Link to="/" className="mb-6 inline-block text-sm text-muted hover:text-honey-400">← Înapoi la marketplace</Link>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-hive-700/60 bg-hex-grid bg-hive-800">
            {product.imagePaths.length > 0 ? (
              <img
                src={`${ASSET_BASE}${product.imagePaths[activeImage]}`}
                alt={product.ai_title}
                className="h-full w-full object-cover"
              />
            ) : (
              // Fără poză — hexagon discret, nu o imagine spartă.
              <svg width="72" height="84" viewBox="0 0 56 66" className="text-honey-500/30" aria-hidden="true">
                <path d="M28 0L56 16.5V49.5L28 66L0 49.5V16.5Z" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            )}
          </div>
          {product.imagePaths.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {product.imagePaths.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={`aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                    i === activeImage ? 'border-honey-500' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={`${ASSET_BASE}${p}`} alt={`Poza ${i + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <Hex className="mb-3">{product.ai_category}</Hex>
          <h1 className="font-display text-4xl font-semibold text-cream md:text-5xl">{product.ai_title}</h1>
          {/* whitespace-pre-line: descrierea poate avea acum până la 3
              paragrafe separate prin \n\n (principal + opțional "Despre
              acest soi:" + opțional "Cum se folosește:") — fără asta,
              HTML-ul comprimă liniile goale și totul arată ca un singur
              bloc de text. */}
          <p className="mt-4 whitespace-pre-line leading-relaxed text-muted">{product.ai_description}</p>

          {product.aiCharacteristics?.length > 0 && (
            <ul className="mt-6 space-y-2">
              {product.aiCharacteristics.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-cream">
                  <span className="h-1.5 w-1.5 rounded-full bg-honey-500" /> {c}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-hive-700 pt-6">
            <span className="font-mono text-2xl text-honey-400">
              {product.raw_price ? `${product.raw_price} RON` : 'Preț la cerere'}
            </span>
            <span className="text-sm text-muted">{product.raw_quantity}</span>
          </div>

          {(!user || user.role === 'buyer') && (
            <button
              onClick={() => { add(product); setAdded(true); setTimeout(() => setAdded(false), 1500); }}
              disabled={unavailable}
              className="mt-4 w-full rounded-full bg-honey-500 px-6 py-2.5 text-sm font-semibold text-hive-950 transition-colors hover:bg-honey-400 disabled:cursor-not-allowed disabled:bg-hive-700 disabled:text-muted"
            >
              {unavailable ? 'Stoc epuizat' : added ? 'Adăugat în coș ✓' : 'Adaugă în coș'}
            </button>
          )}

          <p className="mt-4 text-xs text-muted">Furnizor: {product.supplier_name}</p>
          <p className="mt-1 text-xs text-muted">Livrare estimată: 2-4 zile lucrătoare</p>
        </div>
      </div>
    </div>
  );
}
