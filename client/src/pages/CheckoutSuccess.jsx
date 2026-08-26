import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ordersApi } from '../api';
import { useCart } from '../context/CartContext';

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { clear } = useCart();
  const [status, setStatus] = useState('confirming'); // confirming | done | error
  const [error, setError] = useState(null);
  // StrictMode/re-render nu trebuie să declanșeze confirmarea de 2 ori —
  // backend-ul e idempotent oricum (vezi stripe_session_id), dar evităm
  // și cererea dublă inutilă.
  const confirmed = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      setError('Lipsește session_id — link invalid.');
      setStatus('error');
      return;
    }
    if (confirmed.current) return;
    confirmed.current = true;
    ordersApi.confirmSession(sessionId)
      .then(() => {
        clear();
        setStatus('done');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  }, [sessionId, clear]);

  if (status === 'confirming') {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-display text-3xl font-semibold text-cream">Confirmăm plata...</h1>
        <p className="mt-3 text-muted">Verificăm cu Stripe că plata a trecut — durează câteva secunde.</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-display text-3xl font-semibold text-cream">Plata nu a putut fi confirmată</h1>
        <p className="mt-3 rounded-lg bg-red-900/30 px-4 py-2 text-sm text-red-300">{error}</p>
        <div className="mt-8 flex justify-center gap-4">
          <Link to="/cos" className="rounded-full bg-honey-500 px-6 py-2.5 text-sm font-semibold text-hive-950 hover:bg-honey-400">Înapoi la coș</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold text-cream">Plată confirmată — comandă plasată</h1>
      <p className="mt-3 text-muted">Furnizorii au fost notificați. Poți vedea starea comenzii oricând în contul tău.</p>
      <div className="mt-8 flex justify-center gap-4">
        <Link to="/comenzile-mele" className="rounded-full bg-honey-500 px-6 py-2.5 text-sm font-semibold text-hive-950 hover:bg-honey-400">Vezi comenzile mele</Link>
        <Link to="/" className="rounded-full border border-hive-700 px-6 py-2.5 text-sm text-cream hover:border-honey-500">Continuă cumpărăturile</Link>
      </div>
    </div>
  );
}
