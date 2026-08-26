// Element de semnătură vizuală: un hexagon (celulă de fagure) folosit
// ca badge de categorie și ca formă pentru starea de "loading" AI.
// Nu e doar decor: forma reflectă literal subiectul (fagure = structură hexagonală).
export default function Hex({ children, className = '', filled = false }) {
  return (
    <span
      className={`inline-flex items-center justify-center px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider ${className}`}
      style={{
        clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)',
        background: filled ? '#E8A93B' : 'rgba(232,169,59,0.12)',
        color: filled ? '#150F09' : '#F4C766',
      }}
    >
      {children}
    </span>
  );
}
