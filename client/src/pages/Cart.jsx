import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { ordersApi, ASSET_BASE } from '../api';

export default function Cart() {
  const { items, setQuantity, remove, clear, total } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [shippingName, setShippingName] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingPhone, setShippingPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('ramburs');

  const checkout = async () => {
    if (!user) return navigate('/login', { state: { from: '/cos' } });
    if (!shippingName.trim() || !shippingAddress.trim() || !shippingPhone.trim()) {
      return setError('Completează numele, adresa și telefonul de livrare.');
    }
    setPlacing(true);
    setError(null);
    const cartItems = items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
    const shipping = { shippingName: shippingName.trim(), shippingAddress: shippingAddress.trim(), shippingPhone: shippingPhone.trim() };
    try {
      if (paymentMethod === 'card') {
        // Coșul (localStorage) trebuie păstrat până la confirmare — userul
        // părăsește complet aplicația (redirect pe pagina Stripe) și se
        // poate întoarce cu "Înapoi" fără să fi plătit; clear() se face
        // abia pe pagina de succes, după ce plata e confirmată cu Stripe.
        const { url } = await ordersApi.createCheckoutSession(cartItems, shipping);
        window.location.href = url;
        return;
      }
      await ordersApi.checkout(cartItems, { ...shipping, paymentMethod });
      clear();
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-display text-3xl font-semibold text-cream">Comandă plasată</h1>
        <p className="mt-3 text-muted">Furnizorii au fost notificați. Poți vedea starea comenzii oricând în contul tău.</p>
        <div className="mt-8 flex justify-center gap-4">
          <Link to="/comenzile-mele" className="rounded-full bg-honey-500 px-6 py-2.5 text-sm font-semibold text-hive-950 hover:bg-honey-400">Vezi comenzile mele</Link>
          <Link to="/" className="rounded-full border border-hive-700 px-6 py-2.5 text-sm text-cream hover:border-honey-500">Continuă cumpărăturile</Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-display text-3xl font-semibold text-cream">Coșul e gol</h1>
        <p className="mt-3 text-muted">Adaugă produse din marketplace pentru a le vedea aici.</p>
        <Link to="/" className="mt-8 inline-block rounded-full bg-honey-500 px-6 py-2.5 text-sm font-semibold text-hive-950 hover:bg-honey-400">
          Descoperă mierea →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-4xl font-semibold text-cream md:text-5xl">Coșul tău</h1>

      <div className="mt-8 space-y-3">
        {items.map((i) => (
          // Stivuit pe mobil (imagine+titlu sus, cantitate+șterge jos), rând
          // unic de la sm în sus — pe 375px, un singur rând nu lăsa titlului
          // decât ~82px (restul ocupat de imagine+input+link), iar `truncate`
          // îl tăia ilizibil ("Miere p..."). Fără truncate acum — titlul
          // poate ocupa 2 linii dacă e lung.
          <div key={i.productId} className="flex flex-col gap-3 rounded-xl border border-hive-700/60 bg-hive-800 p-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex gap-4">
              {i.image && <img src={`${ASSET_BASE}${i.image}`} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-cream">{i.title}</p>
                <p className="text-sm text-muted">{i.price ? `${i.price} RON / buc.` : 'preț nespecificat'}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
              <label htmlFor={`qty-${i.productId}`} className="sr-only">Cantitate pentru {i.title}</label>
              <input
                id={`qty-${i.productId}`}
                name={`qty-${i.productId}`}
                type="number"
                min={1}
                value={i.quantity}
                onChange={(e) => setQuantity(i.productId, Number(e.target.value))}
                className="w-16 rounded-lg border border-hive-700 bg-hive-900 px-2 py-1.5 text-center text-cream"
              />
              <button onClick={() => remove(i.productId)} className="shrink-0 text-sm text-red-400 hover:text-red-300">Șterge</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-hive-700 pt-6">
        <span className="text-lg text-cream">Total</span>
        <span className="font-mono text-xl text-honey-400">{total.toFixed(2)} RON</span>
      </div>

      <div className="mt-6 space-y-4 rounded-xl border border-hive-700/60 bg-hive-800 p-4">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-honey-500">Livrare</p>

        <div>
          <label htmlFor="shippingName" className="mb-1 block text-sm font-medium text-cream">Nume destinatar</label>
          <input
            id="shippingName"
            name="shippingName"
            value={shippingName}
            onChange={(e) => setShippingName(e.target.value)}
            className="w-full rounded-lg border border-hive-700 bg-hive-900 px-4 py-2.5 text-cream focus:border-honey-500"
            placeholder="ex: Damian Diana"
          />
        </div>

        <div>
          <label htmlFor="shippingAddress" className="mb-1 block text-sm font-medium text-cream">Adresă de livrare</label>
          <textarea
            id="shippingAddress"
            name="shippingAddress"
            value={shippingAddress}
            onChange={(e) => setShippingAddress(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-hive-700 bg-hive-900 px-4 py-2.5 text-cream focus:border-honey-500"
            placeholder="ex: Str. Exemplu nr. 10, Cluj-Napoca"
          />
        </div>

        <div>
          <label htmlFor="shippingPhone" className="mb-1 block text-sm font-medium text-cream">Telefon</label>
          <input
            id="shippingPhone"
            name="shippingPhone"
            autoComplete="tel"
            value={shippingPhone}
            onChange={(e) => setShippingPhone(e.target.value)}
            className="w-full rounded-lg border border-hive-700 bg-hive-900 px-4 py-2.5 text-cream focus:border-honey-500"
            placeholder="ex: 07xx xxx xxx"
          />
        </div>

        <p className="pt-2 font-mono text-xs uppercase tracking-[0.25em] text-honey-500">Metodă de plată</p>
        <div className="space-y-2">
          <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors ${paymentMethod === 'ramburs' ? 'border-honey-500 bg-hive-700' : 'border-hive-700 bg-hive-900'}`}>
            <input
              type="radio"
              name="paymentMethod"
              value="ramburs"
              checked={paymentMethod === 'ramburs'}
              onChange={() => setPaymentMethod('ramburs')}
              className="accent-honey-500"
            />
            <span className="text-sm text-cream">Ramburs — plătești cash la curier, la livrare</span>
          </label>
          <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors ${paymentMethod === 'card' ? 'border-honey-500 bg-hive-700' : 'border-hive-700 bg-hive-900'}`}>
            <input
              type="radio"
              name="paymentMethod"
              value="card"
              checked={paymentMethod === 'card'}
              onChange={() => setPaymentMethod('card')}
              className="accent-honey-500"
            />
            <span className="text-sm text-cream">Card — plată online, prin Stripe</span>
          </label>
        </div>
        {paymentMethod === 'card' && (
          <p className="text-xs text-muted">
            Vei fi redirecționat către pagina securizată Stripe. Card de test: 4242 4242 4242 4242, orice dată viitoare, orice CVC — acest demo rulează în mod test, nu se procesează bani reali.
          </p>
        )}
      </div>

      {!user && <p className="mt-4 text-sm text-muted">Trebuie să fii autentificat ca să finalizezi comanda.</p>}
      {error && <p className="mt-4 rounded-lg bg-red-900/30 px-4 py-2 text-sm text-red-300">{error}</p>}

      <button
        onClick={checkout}
        disabled={placing}
        className="mt-6 w-full rounded-full bg-honey-500 px-6 py-3 font-semibold text-hive-950 transition-colors hover:bg-honey-400 disabled:opacity-60"
      >
        {placing ? 'Se plasează comanda...' : 'Finalizează comanda →'}
      </button>
    </div>
  );
}
