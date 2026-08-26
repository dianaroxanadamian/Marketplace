import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Footer() {
  const { user } = useAuth();

  return (
    <footer className="border-t border-hive-800 bg-hive-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 56 100" className="text-honey-500">
              <path d="M28 0L56 16V50L28 66L0 50V16Z" fill="currentColor" opacity="0.9" />
            </svg>
            <span className="font-display text-lg font-semibold text-cream">Fagure</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-muted">
            Marketplace pentru apicultori mici — furnizorul încarcă poze, anunțul se scrie automat,
            apicultorul îl verifică înainte să ajungă public.
          </p>
        </div>

        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-honey-500">Navigare</p>
          <nav className="mt-4 flex flex-col gap-2 text-sm text-muted">
            <Link to="/" className="transition-colors hover:text-cream">Marketplace</Link>
            <Link to="/cos" className="transition-colors hover:text-cream">Coș</Link>
            <Link to="/login" className="transition-colors hover:text-cream">Cont</Link>
            {user?.role === 'admin' && (
              <Link to="/admin" className="transition-colors hover:text-cream">Admin</Link>
            )}
          </nav>
        </div>

        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-honey-500">Contact</p>
          <div className="mt-4 space-y-1 text-sm text-muted">
            <p>contact@fagure.ro</p>
            <p>0722 000 000</p>
          </div>
        </div>
      </div>

      <div className="border-t border-hive-800 px-6 py-5 text-center font-mono text-xs text-muted">
        © {new Date().getFullYear()} Fagure
      </div>
    </footer>
  );
}
