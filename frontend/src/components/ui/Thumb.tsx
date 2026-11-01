/** Square-ish property thumbnail with graceful fallback. */
export default function Thumb({ src, className = 'w-20 h-20' }: { src?: string; className?: string }) {
  return (
    <div className={`${className} rounded-lg bg-navy-100 overflow-hidden shrink-0 flex items-center justify-center`}>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <span className="text-2xl opacity-40" aria-hidden="true">🏗️</span>
      )}
    </div>
  );
}
