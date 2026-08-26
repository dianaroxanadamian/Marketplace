import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, ASSET_BASE } from '../api';

export default function SupplierReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState(null);
  // Separat de `error` (folosit mai jos pentru eșecuri de salvare/publicare,
  // pe pagina deja încărcată) — fără el, un ID inexistent sau o cerere căzută
  // lăsa pagina blocată pe "Se încarcă..." la nesfârșit, fără ieșire. Găsit
  // citind codul, nu presupus.
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    api.getProduct(id)
      .then((p) => setProduct({ ...p, charText: p.aiCharacteristics.join('\n') }))
      .catch((e) => setLoadError(e.message || 'Produsul nu a fost găsit.'));
    api.getCategories().then(setCategories);
  }, [id]);

  const update = (field) => (e) => setProduct((p) => ({ ...p, [field]: e.target.value }));

  const buildPayload = () => ({
    aiTitle: product.ai_title,
    aiDescription: product.ai_description,
    aiCategory: product.ai_category,
    aiCharacteristics: product.charText.split('\n').map((s) => s.trim()).filter(Boolean),
    rawPrice: product.raw_price,
    rawQuantity: product.raw_quantity,
  });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProduct(id, buildPayload());
      setProduct({ ...updated, charText: updated.aiCharacteristics.join('\n') });
      setSavedMsg('Modificări salvate.');
      setTimeout(() => setSavedMsg(''), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Acțiune explicită, distinctă de "save": salvează editările curente ȘI
  // marchează produsul ca ciornă lăsată intenționat pentru mai târziu
  // (status='draft'), diferit de "AI a generat, nimeni nu s-a uitat încă".
  const saveAsDraft = async () => {
    setSavingDraft(true);
    setError(null);
    try {
      const updated = await api.updateProduct(id, { ...buildPayload(), status: 'draft' });
      setProduct({ ...updated, charText: updated.aiCharacteristics.join('\n') });
      navigate('/produsele-mele');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDraft(false);
    }
  };

  // Reîncearcă generarea AI cu pozele deja salvate — nu cere reupload.
  const retryAi = async () => {
    setRetrying(true);
    setError(null);
    try {
      const updated = await api.retryAnalysis(id);
      setProduct({ ...updated, charText: updated.aiCharacteristics.join('\n') });
    } catch (err) {
      setError(err.message);
    } finally {
      setRetrying(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    setError(null);
    try {
      await save();
      await api.publishProduct(id);
      navigate(`/produs/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <p className="text-red-300">{loadError}</p>
        <Link to="/" className="mt-4 inline-block rounded-full bg-honey-500 px-6 py-2.5 text-sm font-semibold text-hive-950 hover:bg-honey-400">
          ← Înapoi la marketplace
        </Link>
      </div>
    );
  }
  if (!product) return <p className="mx-auto max-w-3xl px-6 py-20 text-center text-muted">Se încarcă...</p>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-honey-500">Pasul 2 din 2</p>
      <h1 className="font-display text-4xl font-semibold text-cream md:text-5xl">Verifică anunțul</h1>
      <p className="mt-3 text-muted">
        Editează orice câmp înainte de publicare. Nimic nu ajunge pe marketplace fără aprobarea ta.
      </p>

      {product.aiFailed && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-200">
          <p><strong>Generarea automată a eșuat</strong> — poți completa manual câmpurile mai jos, sau încerci din nou.</p>
          <button
            onClick={retryAi}
            disabled={retrying}
            className="mt-3 rounded-full bg-red-500/20 px-4 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/30 disabled:opacity-60"
          >
            {retrying ? 'Se reîncearcă...' : '↻ Reîncearcă generarea automată'}
          </button>
          {product.aiError && (
            <details className="mt-2 text-xs text-red-300/70">
              <summary className="cursor-pointer">Detalii tehnice</summary>
              <p className="mt-1 font-mono">{product.aiError}</p>
            </details>
          )}
        </div>
      )}

      {product.needsManualReview && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-200">
          <strong>⚠ Verifică manual înainte de publicare</strong> — am găsit un tipar cunoscut de
          problemă în text (vezi nota de mai jos). N-am mai rescris automat, ca să nu piardă din
          calitate restul anunțului — corectează câmpul afectat manual.
        </div>
      )}

      {product.ai_confidence_notes && (
        <div className="mt-6 rounded-lg border border-honey-500/30 bg-honey-500/10 px-4 py-3 text-sm text-honey-300">
          <strong>De reținut:</strong> {product.ai_confidence_notes}
        </div>
      )}

      <div className="mt-6 grid gap-8 md:grid-cols-[220px_1fr]">
        <div className="grid grid-cols-2 gap-2">
          {product.imagePaths.map((p, i) => (
            <img
              key={i}
              src={`${ASSET_BASE}${p}`}
              alt={`Poza ${i + 1}`}
              className="aspect-square w-full rounded-xl border border-hive-700 object-cover"
            />
          ))}
        </div>

        <div className="space-y-5">
          <div>
            <label htmlFor="ai_title" className="mb-1 block text-sm font-medium text-cream">Titlu</label>
            <input
              id="ai_title"
              name="ai_title"
              value={product.ai_title ?? ''}
              onChange={update('ai_title')}
              placeholder="ex: Miere de salcâm, recoltă 2026"
              className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
            />
          </div>

          <div>
            <label htmlFor="ai_category" className="mb-1 block text-sm font-medium text-cream">Categorie</label>
            <select
              id="ai_category"
              name="ai_category"
              value={product.ai_category ?? ''}
              onChange={update('ai_category')}
              className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
            >
              <option value="" disabled>Alege o categorie...</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="raw_price" className="mb-1 block text-sm font-medium text-cream">Preț (RON)</label>
              <input
                id="raw_price"
                name="raw_price"
                type="number"
                step="0.01"
                value={product.raw_price ?? ''}
                onChange={update('raw_price')}
                className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
              />
            </div>
            <div>
              <label htmlFor="raw_quantity" className="mb-1 block text-sm font-medium text-cream">Cantitate</label>
              <input
                id="raw_quantity"
                name="raw_quantity"
                value={product.raw_quantity ?? ''}
                onChange={update('raw_quantity')}
                className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <label htmlFor="ai_description" className="mb-1 block text-sm font-medium text-cream">Descriere</label>
        <textarea
          id="ai_description"
          name="ai_description"
          value={product.ai_description ?? ''}
          onChange={update('ai_description')}
          rows={4}
          placeholder="Descrie produsul: soi, gust, mod de recoltare, orice detaliu relevant pentru cumpărător."
          className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
        />
      </div>

      <div className="mt-6">
        <label htmlFor="charText" className="mb-1 block text-sm font-medium text-cream">Caracteristici (câte una pe linie)</label>
        <textarea
          id="charText"
          name="charText"
          value={product.charText}
          onChange={update('charText')}
          rows={4}
          className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 font-mono text-sm text-cream focus:border-honey-500"
        />
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-900/30 px-4 py-2 text-sm text-red-300">{error}</p>}

      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full border border-hive-700 px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:border-honey-500 disabled:opacity-60"
        >
          {saving ? 'Se salvează...' : 'Salvează modificările'}
        </button>
        <button
          onClick={publish}
          disabled={publishing}
          className="relative overflow-hidden rounded-full bg-honey-500 bg-shimmer bg-[length:250%_100%] bg-[position:-150%_0] px-6 py-2.5 text-sm font-semibold text-hive-950 transition-colors hover:bg-honey-400 hover:animate-shimmer disabled:opacity-60"
        >
          {publishing ? 'Se publică...' : 'Publică pe marketplace →'}
        </button>
        {savedMsg && <span className="text-sm text-honey-400">{savedMsg}</span>}
      </div>

      <button
        onClick={saveAsDraft}
        disabled={savingDraft}
        className="mt-6 inline-block text-sm text-muted hover:text-honey-400 disabled:opacity-60"
      >
        {savingDraft ? 'Se salvează ca ciornă...' : 'Salvează ca ciornă și revino mai târziu →'}
      </button>
    </div>
  );
}
