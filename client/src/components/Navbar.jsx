import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const linkClass = ({ isActive }) =>
  `text-sm font-medium transition-colors ${isActive ? 'text-honey-400' : 'text-muted hover:text-cream'}`;

// Variantă pentru linkurile din drawer-ul mobil — mai mari, un rând pe
// link, ca ținte de atins confortabile (nu textul mic, compact, gândit
// pentru un rând flex de desktop).
const mobileLinkClass = ({ isActive }) =>
  `block py-3 text-base font-medium transition-colors ${isActive ? 'text-honey-400' : 'text-cream hover:text-honey-300'}`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const onLogout = async () => {
    setMobileOpen(false);
    await logout();
    navigate('/');
  };

  const closeMobile = () => setMobileOpen(false);

  // Linkurile sunt aceleași pentru desktop și mobil — definite o singură
  // dată ca elemente, randate în două locuri (nav orizontal ascuns sub
  // md, drawer vertical ascuns peste md), ca să nu se dezalinieze cele
  // două liste în timp.
  const links = (
    <>
      <NavLink to="/" end className={linkClass} onClick={closeMobile}>Marketplace</NavLink>
      {user?.role === 'supplier' && (
        <NavLink to="/produsele-mele" className={linkClass} onClick={closeMobile}>Produsele mele</NavLink>
      )}
      {user?.role === 'buyer' && (
        <NavLink to="/comenzile-mele" className={linkClass} onClick={closeMobile}>Comenzile mele</NavLink>
      )}
      {user?.role === 'admin' && (
        <NavLink to="/admin" className={linkClass} onClick={closeMobile}>Admin</NavLink>
      )}
      <NavLink to="/cos" className={linkClass} onClick={closeMobile}>
        Coș{count > 0 ? ` (${count})` : ''}
      </NavLink>
    </>
  );

  const mobileLinks = (
    <>
      <NavLink to="/" end className={mobileLinkClass} onClick={closeMobile}>Marketplace</NavLink>
      {user?.role === 'supplier' && (
        <NavLink to="/produsele-mele" className={mobileLinkClass} onClick={closeMobile}>Produsele mele</NavLink>
      )}
      {user?.role === 'buyer' && (
        <NavLink to="/comenzile-mele" className={mobileLinkClass} onClick={closeMobile}>Comenzile mele</NavLink>
      )}
      {user?.role === 'admin' && (
        <NavLink to="/admin" className={mobileLinkClass} onClick={closeMobile}>Admin</NavLink>
      )}
      <NavLink to="/cos" className={mobileLinkClass} onClick={closeMobile}>
        Coș{count > 0 ? ` (${count})` : ''}
      </NavLink>
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-hive-700/60 bg-hive-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <NavLink to="/" className="flex items-center gap-2" onClick={closeMobile}>
          <svg width="26" height="26" viewBox="0 0 56 100" className="text-honey-500">
            <path d="M28 0L56 16V50L28 66L0 50V16Z" fill="currentColor" opacity="0.9" />
          </svg>
          <span className="font-display text-xl font-semibold text-cream">Fagure</span>
        </NavLink>

        {/* Desktop — neschimbat, un singur rând flex, ascuns sub md */}
        <nav className="hidden items-center gap-6 md:flex">
          {links}

          {user?.role === 'supplier' && (
            <NavLink
              to="/adauga-produs"
              className="rounded-full bg-honey-500 px-4 py-2 text-sm font-semibold text-hive-950 transition-colors hover:bg-honey-400"
            >
              Adaugă produs
            </NavLink>
          )}

          {user ? (
            <button onClick={onLogout} className="text-sm text-muted hover:text-cream">
              Ieși ({user.name})
            </button>
          ) : (
            <NavLink to="/login" className={linkClass}>Autentificare</NavLink>
          )}
        </nav>

        {/* Hamburger — vizibil doar sub md, unde linkurile nu mai încap
            pe un rând (bug real, prins la audit-ul mobil 375px: nav-ul
            depășea viewport-ul cu până la 163px). */}
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="flex h-9 w-9 items-center justify-center text-cream md:hidden"
          aria-label={mobileOpen ? 'Închide meniul' : 'Deschide meniul'}
          aria-expanded={mobileOpen}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {mobileOpen ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Drawer mobil — expandabil sub header, aceeași temă (hive-950,
          honey, cream) ca restul aplicației. */}
      {mobileOpen && (
        <div className="border-t border-hive-700/60 bg-hive-950 px-6 pb-6 md:hidden">
          <nav className="flex flex-col divide-y divide-hive-800/60">
            {mobileLinks}

            {user?.role === 'supplier' && (
              <NavLink
                to="/adauga-produs"
                className="mt-3 block rounded-full bg-honey-500 px-4 py-2.5 text-center text-sm font-semibold text-hive-950 transition-colors hover:bg-honey-400"
                onClick={closeMobile}
              >
                Adaugă produs
              </NavLink>
            )}

            {user ? (
              <button onClick={onLogout} className="py-3 text-left text-base text-muted hover:text-cream">
                Ieși ({user.name})
              </button>
            ) : (
              <NavLink to="/login" className={mobileLinkClass} onClick={closeMobile}>Autentificare</NavLink>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
