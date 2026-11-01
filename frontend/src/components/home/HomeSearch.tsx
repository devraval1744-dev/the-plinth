import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { suggestSearchApi } from '../../api/properties.api';
import { useDebounce } from '../../hooks/useDebounce';
import { searchToQueryString } from '../../utils/format';
import { AHMEDABAD_LOCALITIES, BHK_TYPES } from '../../types';
import type { SearchSuggestions } from '../../types';

const BUDGETS = [
  { label: 'Any budget', value: '' },
  { label: 'Under ₹30 L', value: '3000000' },
  { label: 'Under ₹50 L', value: '5000000' },
  { label: 'Under ₹75 L', value: '7500000' },
  { label: 'Under ₹1 Cr', value: '10000000' },
  { label: 'Under ₹1.5 Cr', value: '15000000' },
  { label: 'Under ₹2 Cr', value: '20000000' },
];

interface Option {
  key: string;
  group: 'Projects' | 'Localities' | 'Builders';
  label: string;
  hint?: string;
  go: () => void;
}

/** Home hero search: free text with live suggestions + locality / BHK / budget filters. */
export default function HomeSearch() {
  const navigate = useNavigate();
  const listId = useId();
  const [text, setText] = useState('');
  const [locality, setLocality] = useState('');
  const [bhk, setBhk] = useState('');
  const [budget, setBudget] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestions | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  const debounced = useDebounce(text.trim(), 220);

  useEffect(() => {
    if (debounced.length < 2) { setSuggestions(null); return; }
    let cancelled = false;
    suggestSearchApi(debounced)
      .then((s) => { if (!cancelled) setSuggestions(s); })
      .catch(() => { if (!cancelled) setSuggestions(null); });
    return () => { cancelled = true; };
  }, [debounced]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const options = useMemo<Option[]>(() => {
    if (!suggestions) return [];
    return [
      ...suggestions.projects.map((p): Option => ({
        key: `p-${p.id}`, group: 'Projects', label: p.name, hint: p.locality, go: () => navigate(`/properties/${p.id}`),
      })),
      ...suggestions.localities.map((l): Option => ({
        key: `l-${l.name}`, group: 'Localities', label: l.name, hint: `${l.count} ${l.count === 1 ? 'property' : 'properties'}`,
        go: () => navigate(`/properties${searchToQueryString({ locality: l.name })}`),
      })),
      ...suggestions.builders.map((b): Option => ({
        key: `b-${b.name}`, group: 'Builders', label: b.name, hint: `${b.count} ${b.count === 1 ? 'project' : 'projects'}`,
        go: () => navigate(`/properties${searchToQueryString({ search: b.name })}`),
      })),
    ];
  }, [suggestions, navigate]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setOpen(false);
    navigate(
      `/properties${searchToQueryString({
        search: text.trim() || undefined,
        locality: locality || undefined,
        bhk: bhk || undefined,
        maxPrice: budget ? Number(budget) : undefined,
      })}`
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (options.length === 0 ? -1 : (i + 1) % options.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (options.length === 0 ? -1 : (i <= 0 ? options.length - 1 : i - 1)));
    } else if (e.key === 'Enter' && open && active >= 0 && options[active]) {
      e.preventDefault();
      setOpen(false);
      options[active].go();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  let lastGroup = '';
  return (
    <form onSubmit={submit} className="bg-white rounded-xl p-3 shadow-card-hover grid grid-cols-1 md:grid-cols-12 gap-2" role="search">
      <div className="md:col-span-5 relative" ref={rootRef}>
        <label htmlFor="home-search" className="sr-only">Search by locality, project or builder</label>
        <input
          id="home-search"
          className="input h-11"
          placeholder="Search by locality, project or builder…"
          value={text}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {open && options.length > 0 && (
          <ul id={listId} role="listbox"
            className="absolute z-30 left-0 right-0 mt-1 bg-white rounded-xl shadow-card-hover border border-navy-100 max-h-80 overflow-y-auto py-1">
            {options.map((o, i) => {
              const header = o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <li key={o.key} role="presentation">
                  {header && <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-400">{header}</p>}
                  <button
                    type="button"
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => { setOpen(false); o.go(); }}
                    className={`w-full text-left px-4 py-2 flex items-center justify-between gap-3 text-sm ${i === active ? 'bg-cream-100' : ''}`}
                  >
                    <span className="font-medium text-navy-800 truncate">{o.label}</span>
                    {o.hint && <span className="text-xs text-navy-400 shrink-0">{o.hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <label className="md:col-span-2"><span className="sr-only">Locality</span>
        <select className="input h-11" value={locality} onChange={(e) => setLocality(e.target.value)}>
          <option value="">All localities</option>
          {AHMEDABAD_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <label className="md:col-span-2"><span className="sr-only">Home size</span>
        <select className="input h-11" value={bhk} onChange={(e) => setBhk(e.target.value)}>
          <option value="">Any size</option>
          {BHK_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      <label className="md:col-span-2"><span className="sr-only">Budget</span>
        <select className="input h-11" value={budget} onChange={(e) => setBudget(e.target.value)}>
          {BUDGETS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </label>
      <button type="submit" className="btn-gold h-11 md:col-span-1">Search</button>
    </form>
  );
}
