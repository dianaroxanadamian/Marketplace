import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const initialForm = {
  supplierContact: '',
  rawName: '',
  rawPrice: '',
  rawQuantity: '',
  rawNotes: '',
};

const MIN_IMAGES = 2;
const MAX_IMAGES = 5;

export default function SupplierUpload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [files, setFiles] = useState([]); // [{ file, preview }]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // Extrasă din onFileChange, ca s-o poată folosi și onDrop — textul zicea
  // "Trage poze aici", dar zona era doar un <label>, fără niciun handler de
  // drag-and-drop; un <label> nu devine automat zonă de drop în HTML, click
  // funcționa (asociat nativ cu input-ul), drag-and-drop nu făcea nimic.
  const addFiles = (fileList) => {
    const picked = Array.from(fileList || []);
    if (picked.length === 0) return;
    setFiles((prev) => {
      const combined = [...prev, ...picked.map((file) => ({ file, preview: URL.createObjectURL(file) }))];
      return combined.slice(0, MAX_IMAGES);
    });
  };

  const onFileChange = (e) => {
    addFiles(e.target.files);
    e.target.value = ''; // permite re-selectarea aceluiași fișier dacă a fost șters
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  // preventDefault() e obligatoriu aici — fără el, browserul refuză implicit
  // drop-ul (comportamentul standard e să deschidă fișierul, nu să-l lase
  // să cadă pe element), iar onDrop nu s-ar mai declanșa deloc.
  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (files.length < MIN_IMAGES) return setError(`Adaugă cel puțin ${MIN_IMAGES} poze ale produsului.`);

    setLoading(true);
    try {
      const fd = new FormData();
      files.forEach(({ file }) => fd.append('images', file));
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));

      const product = await api.analyzeProduct(fd);
      navigate(`/verifica/${product.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-honey-500">Pasul 1 din 2</p>
      <h1 className="font-display text-4xl font-semibold text-cream md:text-5xl">Adaugă un produs nou</h1>
      <p className="mt-3 text-muted">
        Încarcă {MIN_IMAGES}-{MAX_IMAGES} poze și câteva informații de bază. Titlul, descrierea, categoria
        și caracteristicile se pregătesc automat — le verifici și le publici la pasul următor.
      </p>

      <form onSubmit={onSubmit} className="mt-10 space-y-6">
        {/* Upload poze multiple */}
        <div>
          <label className="mb-2 block text-sm font-medium text-cream">
            Poze produs * ({files.length}/{MAX_IMAGES}, minim {MIN_IMAGES})
          </label>

          {files.length === 0 ? (
            // Fără poze încă — dropzone mare, invitație clară să înceapă.
            <label
              htmlFor="images"
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`flex aspect-video cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors ${
                isDragging ? 'border-honey-500 bg-hive-700' : 'border-hive-700 bg-hive-800 hover:border-honey-500'
              }`}
            >
              <div className="text-center">
                <p className="text-cream">Trage poze aici sau apasă pentru a alege</p>
                <p className="mt-1 text-xs text-muted">JPG, PNG sau WEBP, până la 8MB fiecare — poți selecta mai multe deodată</p>
              </div>
            </label>
          ) : (
            // Poze deja selectate — plăcuța "adaugă" e o pătrățică de-aceeași
            // mărime ca miniaturile, în aceeași grilă, nu un dropzone mare
            // gol dedesubt (arăta ca și cum nimic nu s-ar fi încărcat).
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {files.map((f, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-hive-700">
                  <img src={f.preview} alt={`Poza ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-hive-950/80 text-xs text-cream opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`Șterge poza ${i + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {files.length < MAX_IMAGES && (
                <label
                  htmlFor="images"
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center transition-colors ${
                    isDragging ? 'border-honey-500 bg-hive-700' : 'border-hive-700 bg-hive-800 hover:border-honey-500'
                  }`}
                >
                  <span className="text-2xl leading-none text-honey-500">+</span>
                  <span className="px-1 text-[11px] text-muted">Adaugă</span>
                </label>
              )}
            </div>
          )}
          <input
            id="images"
            name="images"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onFileChange}
            className="hidden"
          />
        </div>

        <p className="text-sm text-muted">
          Publicat ca <span className="text-cream">{user?.name}</span>.
        </p>

        <div>
          <label htmlFor="supplierContact" className="mb-1 block text-sm font-medium text-cream">Contact (telefon sau email)</label>
          <input
            id="supplierContact"
            name="supplierContact"
            autoComplete="tel"
            value={form.supplierContact}
            onChange={update('supplierContact')}
            className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
            placeholder="ex: 07xx xxx xxx"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="rawName" className="mb-1 block text-sm font-medium text-cream">Denumire produs (cum îl știi tu)</label>
            <input
              id="rawName"
              name="rawName"
              value={form.rawName}
              onChange={update('rawName')}
              className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
              placeholder="ex: miere de salcâm"
            />
          </div>
          <div>
            <label htmlFor="rawQuantity" className="mb-1 block text-sm font-medium text-cream">Cantitate / gramaj</label>
            <input
              id="rawQuantity"
              name="rawQuantity"
              value={form.rawQuantity}
              onChange={update('rawQuantity')}
              className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
              placeholder="ex: borcan 800g"
            />
          </div>
        </div>

        <div>
          <label htmlFor="rawPrice" className="mb-1 block text-sm font-medium text-cream">Preț (RON)</label>
          <input
            id="rawPrice"
            name="rawPrice"
            type="number"
            step="0.01"
            value={form.rawPrice}
            onChange={update('rawPrice')}
            className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
            placeholder="ex: 35"
          />
        </div>

        <div>
          <label htmlFor="rawNotes" className="mb-1 block text-sm font-medium text-cream">Alte detalii utile (opțional)</label>
          <textarea
            id="rawNotes"
            name="rawNotes"
            value={form.rawNotes}
            onChange={update('rawNotes')}
            rows={3}
            className="w-full rounded-lg border border-hive-700 bg-hive-800 px-4 py-2.5 text-cream focus:border-honey-500"
            placeholder="ex: recoltată în iunie 2026, nepasteurizată"
          />
        </div>

        {error && <p className="rounded-lg bg-red-900/30 px-4 py-2 text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-honey-500 px-6 py-3 font-semibold text-hive-950 transition-colors hover:bg-honey-400 disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-hive-950 border-t-transparent" />
              Analizăm pozele...
            </>
          ) : (
            'Generează anunțul automat →'
          )}
        </button>
      </form>
    </div>
  );
}
