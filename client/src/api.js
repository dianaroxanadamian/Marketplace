// window.location.hostname, nu 'localhost' hardcodat — ca aplicația să
// funcționeze identic accesată de pe alt dispozitiv din rețeaua locală
// (ex. telefon), unde 'localhost' ar însemna dispozitivul respectiv, nu
// acest PC. Portul backend-ului (4000) rămâne fix, doar host-ul e dinamic.
const API_BASE = `http://${window.location.hostname}:4000/api`;
export const ASSET_BASE = `http://${window.location.hostname}:4000`;

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Eroare server (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

// credentials: 'include' pe fiecare cerere — sesiunea (cookie httpOnly) e
// ceea ce autorizează acum modificările, nu un header cu numele declarat.
const withCreds = (opts = {}) => ({ credentials: 'include', ...opts });
const json = (data) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

export const api = {
  getProducts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetch(`${API_BASE}/products${qs ? `?${qs}` : ''}`, withCreds()).then(handle);
  },
  getProduct: (id) => fetch(`${API_BASE}/products/${id}`, withCreds()).then(handle),
  getCategories: () => fetch(`${API_BASE}/products/categories`).then(handle),
  analyzeProduct: (formData) =>
    fetch(`${API_BASE}/products/analyze`, withCreds({ method: 'POST', body: formData })).then(handle),
  updateProduct: (id, data) =>
    fetch(`${API_BASE}/products/${id}`, withCreds({ method: 'PATCH', ...json(data) })).then(handle),
  retryAnalysis: (id) =>
    fetch(`${API_BASE}/products/${id}/retry-analysis`, withCreds({ method: 'POST' })).then(handle),
  publishProduct: (id) =>
    fetch(`${API_BASE}/products/${id}/publish`, withCreds({ method: 'POST' })).then(handle),
  unpublishProduct: (id) =>
    fetch(`${API_BASE}/products/${id}/unpublish`, withCreds({ method: 'POST' })).then(handle),
  deleteProduct: (id) =>
    fetch(`${API_BASE}/products/${id}`, withCreds({ method: 'DELETE' })).then(handle),
};

export const authApi = {
  me: () => fetch(`${API_BASE}/auth/me`, withCreds()).then(handle),
  register: (data) => fetch(`${API_BASE}/auth/register`, withCreds({ method: 'POST', ...json(data) })).then(handle),
  login: (data) => fetch(`${API_BASE}/auth/login`, withCreds({ method: 'POST', ...json(data) })).then(handle),
  logout: () => fetch(`${API_BASE}/auth/logout`, withCreds({ method: 'POST' })).then(handle),
};

export const ordersApi = {
  checkout: (items, shipping) => fetch(`${API_BASE}/orders`, withCreds({ method: 'POST', ...json({ items, ...shipping }) })).then(handle),
  createCheckoutSession: (items, shipping) =>
    fetch(`${API_BASE}/orders/checkout-session`, withCreds({ method: 'POST', ...json({ items, ...shipping }) })).then(handle),
  confirmSession: (sessionId) =>
    fetch(`${API_BASE}/orders/confirm-session?session_id=${encodeURIComponent(sessionId)}`, withCreds()).then(handle),
  mine: () => fetch(`${API_BASE}/orders/mine`, withCreds()).then(handle),
};

export const adminApi = {
  stats: () => fetch(`${API_BASE}/admin/stats`, withCreds()).then(handle),
  users: () => fetch(`${API_BASE}/admin/users`, withCreds()).then(handle),
  orders: () => fetch(`${API_BASE}/admin/orders`, withCreds()).then(handle),
  activity: () => fetch(`${API_BASE}/admin/activity`, withCreds()).then(handle),
};
