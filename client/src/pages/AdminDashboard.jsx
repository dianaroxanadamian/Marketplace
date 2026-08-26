import { useEffect, useState } from 'react';
import { adminApi } from '../api';

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-hive-700/60 bg-hive-800 p-5">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 font-mono text-2xl text-honey-400">{value}</p>
    </div>
  );
}

const TABS = [
  { key: 'activity', label: 'Activitate' },
  { key: 'users', label: 'Utilizatori' },
  { key: 'orders', label: 'Comenzi' },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('activity');
  const [activity, setActivity] = useState(null);
  const [users, setUsers] = useState(null);
  const [orders, setOrders] = useState(null);

  useEffect(() => { adminApi.stats().then(setStats); }, []);

  useEffect(() => {
    if (tab === 'activity' && !activity) adminApi.activity().then(setActivity);
    if (tab === 'users' && !users) adminApi.users().then(setUsers);
    if (tab === 'orders' && !orders) adminApi.orders().then(setOrders);
  }, [tab]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="font-display text-4xl font-semibold text-cream md:text-5xl">Panou admin</h1>
      <p className="mt-3 text-muted">Cine e logat, ce s-a cumpărat, ce s-a întâmplat pe site.</p>

      {stats && (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Cumpărători" value={stats.usersByRole.buyer || 0} />
          <StatCard label="Furnizori" value={stats.usersByRole.supplier || 0} />
          <StatCard label="Comenzi" value={stats.orderCount} />
          <StatCard label="Produse publicate" value={stats.productsByStatus.published || 0} />
        </div>
      )}

      <div className="mt-10 flex gap-2 border-b border-hive-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'border-b-2 border-honey-500 text-cream' : 'text-muted hover:text-cream'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'activity' && (
        <div className="mt-6 space-y-2">
          {activity === null && <p className="text-muted">Se încarcă...</p>}
          {activity?.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-hive-700/60 bg-hive-800 px-4 py-2.5 text-sm">
              <span className="text-cream">{a.label}{a.user_name ? ` — ${a.user_name}` : ''}</span>
              <span className="text-xs text-muted">{a.detail}</span>
              <span className="shrink-0 font-mono text-xs text-muted">{new Date(a.created_at).toLocaleString('ro-RO')}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div className="mt-6 space-y-2">
          {users === null && <p className="text-muted">Se încarcă...</p>}
          {users?.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-lg border border-hive-700/60 bg-hive-800 px-4 py-2.5 text-sm">
              <div>
                <span className="text-cream">{u.name}</span>
                <span className="ml-2 text-xs text-muted">{u.email}</span>
              </div>
              <span className="rounded-full bg-hive-700 px-2.5 py-0.5 text-xs text-muted">{u.role}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'orders' && (
        <div className="mt-6 space-y-2">
          {orders === null && <p className="text-muted">Se încarcă...</p>}
          {orders?.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg border border-hive-700/60 bg-hive-800 px-4 py-2.5 text-sm">
              <div>
                <span className="text-cream">{o.product_title}</span>
                <span className="ml-2 text-xs text-muted">de la {o.buyer_name} ({o.buyer_email})</span>
              </div>
              <span className="shrink-0 font-mono text-xs text-muted">{o.quantity} buc. · {new Date(o.created_at).toLocaleString('ro-RO')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
