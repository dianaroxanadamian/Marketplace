import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import Marketplace from './pages/Marketplace';
import ProductDetail from './pages/ProductDetail';
import SupplierUpload from './pages/SupplierUpload';
import SupplierReview from './pages/SupplierReview';
import SupplierDashboard from './pages/SupplierDashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import Cart from './pages/Cart';
import CheckoutSuccess from './pages/CheckoutSuccess';
import MyOrders from './pages/MyOrders';
import AdminDashboard from './pages/AdminDashboard';
import { useMotionPresets } from './lib/motion';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

// Separată de App ca să poată folosi useLocation() (are nevoie să fie deja
// în interiorul BrowserRouter) — AnimatePresence are nevoie de `location`
// ca `key`, ca să detecteze schimbarea de rută și să anime tranziția.
function AnimatedRoutes() {
  const location = useLocation();
  const { pageTransition } = useMotionPresets();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<motion.div {...pageTransition}><Marketplace /></motion.div>} />
        <Route path="/produs/:id" element={<motion.div {...pageTransition}><ProductDetail /></motion.div>} />
        <Route path="/login" element={<motion.div {...pageTransition}><Login /></motion.div>} />
        <Route path="/inregistrare" element={<motion.div {...pageTransition}><Register /></motion.div>} />
        <Route path="/cos" element={<motion.div {...pageTransition}><Cart /></motion.div>} />
        <Route path="/cos/succes" element={<motion.div {...pageTransition}><ProtectedRoute role="buyer"><CheckoutSuccess /></ProtectedRoute></motion.div>} />
        <Route
          path="/comenzile-mele"
          element={<motion.div {...pageTransition}><ProtectedRoute role="buyer"><MyOrders /></ProtectedRoute></motion.div>}
        />
        <Route
          path="/adauga-produs"
          element={<motion.div {...pageTransition}><ProtectedRoute role="supplier"><SupplierUpload /></ProtectedRoute></motion.div>}
        />
        <Route
          path="/verifica/:id"
          element={<motion.div {...pageTransition}><ProtectedRoute role="supplier"><SupplierReview /></ProtectedRoute></motion.div>}
        />
        <Route
          path="/produsele-mele"
          element={<motion.div {...pageTransition}><ProtectedRoute role="supplier"><SupplierDashboard /></ProtectedRoute></motion.div>}
        />
        <Route
          path="/admin"
          element={<motion.div {...pageTransition}><ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute></motion.div>}
        />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <Navbar />
          <main>
            <AnimatedRoutes />
          </main>
          <Footer />
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}
