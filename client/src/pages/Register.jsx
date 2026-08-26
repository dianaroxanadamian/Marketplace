import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  { value: 'buyer', label: 'Cumpărător', hint: 'Vreau să cumpăr miere' },
  { value: 'supplier', label: 'Furnizor', hint: 'Vreau să vând produse din stupina mea' },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'buyer' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await register(form);
      navigate(user.role === 'supplier' ? '/adauga-produs' : '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-3xl font-semibold text-cream">Creează cont</h1>
      <p className="mt-2 text-muted">Alege tipul de cont potrivit — poți schimba oricând ce faci pe Fagure.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {ROLES.map((r) => (
            <button
              type="button"
              key={r.value}
              onClick={() => setForm((f) => ({ ...f, role: r.value }))}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                form.role === r.value ? 'border-honey-500 bg-honey-500/10' : 'border-hive-700 bg-hive-800 hover:border-hive-600'
              }`}
            >
              <p className="font-medium text-cream">{r.label}</p>
              <p className="mt-0.5 text-xs text-muted">{r.hint}</p>
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-cream">Nume {form.role === 'supplier' ? '/ al stupinei' : ''}</label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            value={form.name}
            onChange={update('name')}
            required
            placeholder={form.role === 'supplier' ? 'ex: Stupina Damian' : 'ex: Ion Popescu'}
            className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-cream">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={update('email')}
            required
            className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-cream">Parolă</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
            required
            minLength={6}
            placeholder="cel puțin 6 caractere"
            className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
          />
        </div>

        {error && <p className="rounded-lg bg-red-900/30 px-4 py-2 text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-honey-500 px-6 py-2.5 font-semibold text-hive-950 transition-colors hover:bg-honey-400 disabled:opacity-60"
        >
          {loading ? 'Se creează contul...' : 'Creează cont'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Ai deja cont? <Link to="/login" className="text-honey-400 hover:text-honey-300">Autentifică-te</Link>
      </p>
    </div>
  );
}
