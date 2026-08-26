import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersApi, ASSET_BASE } from '../api';

export default function MyOrders() {
  const [orders, setOrders] = useState(null);

  useEffect(() => { ordersApi.mine().then(setOrders); }, []);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-4xl font-semibold text-cream md:text-5xl">Comenzile mele</h1>

      {orders === null && <p className="mt-8 text-muted">Se încarcă...</p>}
      {orders?.length === 0 && (
        <p className="mt-8 text-muted">
          Nicio comandă încă. <Link to="/" className="text-honey-400 hover:text-honey-300">Descoperă mierea →</Link>
        </p>
      )}

      <div className="mt-8 space-y-3">
        {orders?.map((o) => (
          <div key={o.id} className="rounded-xl border border-hive-700/60 bg-hive-800 p-3">
            <div className="flex items-center gap-4">
              {o.product.imagePaths[0] && (
                <img src={`${ASSET_BASE}${o.product.imagePaths[0]}`} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-cream">{o.product.title}</p>
                <p className="text-xs text-muted">de la {o.product.supplierName} · {o.quantity} buc. · {new Date(o.createdAt).toLocaleDateString('ro-RO')}</p>
              </div>
              <span className="shrink-0 rounded-full bg-honey-500/20 px-2.5 py-1 text-xs text-honey-400">Plasată</span>
            </div>
            {(o.shippingAddress || o.paymentMethod) && (
              <div className="mt-3 border-t border-hive-700/60 pt-3 text-xs text-muted">
                {o.shippingName && <p>{o.shippingName}{o.shippingPhone ? ` · ${o.shippingPhone}` : ''}</p>}
                {o.shippingAddress && <p>{o.shippingAddress}</p>}
                <p className="mt-1 text-honey-400">{o.paymentMethod === 'card' ? 'Plată cu cardul' : 'Plată ramburs, la livrare'}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
