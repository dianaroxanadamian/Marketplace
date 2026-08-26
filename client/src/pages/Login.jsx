import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(form);
      navigate(location.state?.from || (user.role === 'admin' ? '/admin' : '/'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-3xl font-semibold text-cream">Autentificare</h1>
      <p className="mt-2 text-muted">Intră în cont pentru a cumpăra sau a adăuga produse.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
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
            autoComplete="current-password"
            value={form.password}
            onChange={update('password')}
            required
            className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
          />
        </div>

        {error && <p className="rounded-lg bg-red-900/30 px-4 py-2 text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-honey-500 px-6 py-2.5 font-semibold text-hive-950 transition-colors hover:bg-honey-400 disabled:opacity-60"
        >
          {loading ? 'Se autentifică...' : 'Intră în cont'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Nu ai cont? <Link to="/inregistrare" className="text-honey-400 hover:text-honey-300">Creează unul</Link>
      </p>
    </div>
  );
}
