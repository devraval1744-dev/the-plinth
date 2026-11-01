import { useLocation, useNavigate } from 'react-router-dom';
import { MAX_COMPARE, useCompare } from '../../context/CompareContext';

/** Floating tray that appears once a property is added to compare. */
export default function CompareBar() {
  const { items, remove, clear } = useCompare();
  const navigate = useNavigate();
  const location = useLocation();

  const hiddenOn = ['/compare', '/login', '/signup'];
  if (items.length === 0 || hiddenOn.includes(location.pathname)) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 bottom-[4.75rem] sm:bottom-5 w-[calc(100%-1.5rem)] max-w-2xl
        bg-navy-900 text-cream-100 rounded-2xl shadow-card-hover px-4 py-3 flex items-center gap-3"
      role="region"
      aria-label="Property comparison"
    >
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto">
        {items.map((i) => (
          <span key={i.id} className="inline-flex items-center gap-1.5 bg-navy-700 rounded-full pl-3 pr-1.5 py-1 text-xs whitespace-nowrap">
            <span className="max-w-[8rem] truncate">{i.name}</span>
            <button
              onClick={() => remove(i.id)}
              className="w-5 h-5 rounded-full hover:bg-navy-500 leading-none"
              aria-label={`Remove ${i.name} from comparison`}
            >
              ×
            </button>
          </span>
        ))}
        <span className="text-xs text-navy-300 whitespace-nowrap">{items.length}/{MAX_COMPARE}</span>
      </div>
      <button onClick={clear} className="text-xs text-navy-300 hover:text-white hidden sm:block">Clear</button>
      <button
        onClick={() => navigate(`/compare?ids=${items.map((i) => i.id).join(',')}`)}
        disabled={items.length < 2}
        className="btn-gold px-4 py-2 text-xs whitespace-nowrap"
        title={items.length < 2 ? 'Add at least two properties to compare' : undefined}
      >
        Compare {items.length > 1 ? `(${items.length})` : ''}
      </button>
    </div>
  );
}
