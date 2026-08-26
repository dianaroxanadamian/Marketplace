import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Redirect imperativ (useNavigate + useEffect cu deps), NU <Navigate> declarativ:
// <Navigate> reface efectul (fără deps array, în react-router) la fiecare
// commit, iar AnimatePresence mode="wait" (din App.jsx) ține montată ruta
// veche în timpul animației de exit — combinația producea navigate() la
// infinit ("Maximum update depth exceeded"), confirmat live în browser.
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate('/login', { state: { from: location.pathname }, replace: true });
    else if (role && user.role !== role) navigate('/', { replace: true });
  }, [loading, user, role]);

  if (loading || !user || (role && user.role !== role)) {
    return <p className="mx-auto max-w-3xl px-6 py-20 text-center text-muted">Se încarcă...</p>;
  }
  return children;
}
