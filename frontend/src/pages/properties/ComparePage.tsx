import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import CustomerMobileNav from '../../components/layout/CustomerMobileNav';
import SaveButton from '../../components/property/SaveButton';
import EmptyState, { SectionError } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { MAX_COMPARE, useCompare } from '../../context/CompareContext';
import { useAsync } from '../../hooks/useAsync';
import { comparePropertiesApi } from '../../api/properties.api';
import { formatDate, formatPriceCompact, formatPriceRange, getBuilderName, getPrimaryImage } from '../../utils/format';
import type { Property } from '../../types';

const avgPsf = (p: Property) => {
  const price = (p.minPrice + p.maxPrice) / 2;
  const area = (p.minArea + p.maxArea) / 2;
  return area > 0 ? Math.round(price / area) : 0;
};

/** Index of the best value (lowest or highest) among positive numbers, or -1 when they all tie. */
function bestIndex(values: number[], mode: 'min' | 'max'): number {
  const usable = values.filter((v) => v > 0);
  if (usable.length < 2) return -1;
  const target = mode === 'min' ? Math.min(...usable) : Math.max(...usable);
  if (usable.every((v) => v === target)) return -1;
  return values.indexOf(target);
}

export default function ComparePage() {
  const { user } = useAuth();
  const compare = useCompare();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // The URL is the source of truth (shareable); fall back to the tray selection
  const ids = useMemo(() => {
    const fromUrl = (params.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_COMPARE);
    return fromUrl.length > 0 ? fromUrl : compare.items.map((i) => i.id);
  }, [params, compare.items]);
  const idsKey = ids.join(',');

  const result = useAsync(() => comparePropertiesApi(ids), [idsKey], ids.length >= 2);

  // Keep the URL in step with the selection so the page can be shared / refreshed
  useEffect(() => {
    if (ids.length > 0 && params.get('ids') !== idsKey) setParams({ ids: idsKey }, { replace: true });
  }, [idsKey, params, setParams, ids.length]);

  const remove = (id: string) => {
    compare.remove(id);
    const rest = ids.filter((x) => x !== id);
    setParams(rest.length > 0 ? { ids: rest.join(',') } : {}, { replace: true });
  };

  const props = result.data ?? [];
  const amenityUnion = useMemo(
    () => [...new Set(props.flatMap((p) => p.amenities))].sort((a, b) => a.localeCompare(b)),
    [props]
  );

  const rows: { label: string; render: (p: Property, i: number) => React.ReactNode }[] = props.length < 2 ? [] : [
    {
      label: 'Price range',
      render: (p, i) => (
        <span className={bestIndex(props.map((x) => x.minPrice), 'min') === i ? 'font-semibold text-green-700' : ''}>
          {formatPriceRange(p.minPrice, p.maxPrice)}
          {bestIndex(props.map((x) => x.minPrice), 'min') === i && <span className="ml-1.5 text-[10px] bg-green-100 text-green-800 rounded-full px-1.5 py-0.5">Lowest entry</span>}
        </span>
      ),
    },
    {
      label: 'Avg. price / sq.ft',
      render: (p, i) => (
        <span className={bestIndex(props.map(avgPsf), 'min') === i ? 'font-semibold text-green-700' : ''}>
          {avgPsf(p) > 0 ? `₹${avgPsf(p).toLocaleString('en-IN')}` : '—'}
        </span>
      ),
    },
    { label: 'Area', render: (p) => `${p.minArea}–${p.maxArea} sq.ft` },
    { label: 'Locality', render: (p) => `${p.locality}, ${p.city}` },
    { label: 'Type', render: (p) => p.propertyType },
    { label: 'Construction', render: (p) => p.constructionStatus },
    { label: 'Possession', render: (p) => (p.possessionDate ? formatDate(p.possessionDate) : '—') },
    {
      label: 'Units available',
      render: (p, i) => (
        <span className={bestIndex(props.map((x) => x.availableUnits), 'max') === i ? 'font-semibold' : ''}>
          {p.availableUnits} of {p.totalUnits}
        </span>
      ),
    },
    {
      label: 'Configurations',
      render: (p) =>
        p.bhkConfigurations.length === 0 ? '—' : (
          <ul className="space-y-1">
            {p.bhkConfigurations.map((b) => (
              <li key={b.type + b.areaSqFt} className="text-xs">
                <span className="font-semibold text-navy-800">{b.type}</span> · {b.areaSqFt} sq.ft · {formatPriceCompact(b.priceMin)}
              </li>
            ))}
          </ul>
        ),
    },
    { label: 'Builder', render: (p) => getBuilderName(p.builderId) },
  ];

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />
      <main className="page-container py-8 space-y-6 pb-28 sm:pb-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">Compare properties</h1>
            <p className="text-navy-500 mt-1">Side-by-side view of up to {MAX_COMPARE} properties. Best values are highlighted.</p>
          </div>
          <Link to="/properties" className="btn-secondary">+ Add more</Link>
        </div>

        {ids.length < 2 ? (
          <EmptyState
            icon="⇄"
            title={ids.length === 0 ? 'Nothing to compare yet' : 'Add one more property'}
            message="Use the “Compare” button on property cards to pick two or three homes, then come back here."
            action={<button className="btn-primary" onClick={() => navigate('/properties')}>Browse properties</button>}
          />
        ) : result.loading ? (
          <div className="grid grid-cols-3 gap-4"><Skeleton className="h-96" /><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
        ) : result.error ? (
          <SectionError message={result.error} onRetry={result.reload} />
        ) : props.length < 2 ? (
          <EmptyState icon="🏚️" title="Some of these properties are no longer available" message="Pick other properties to compare."
            action={<button className="btn-primary" onClick={() => { compare.clear(); navigate('/properties'); }}>Start over</button>} />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white z-10 w-36 min-w-[9rem]" />
                  {props.map((p) => (
                    <th key={p._id} className="align-top p-4 text-left font-normal min-w-[14rem] border-l border-navy-100">
                      <div className="relative h-32 rounded-lg overflow-hidden bg-navy-100 mb-3">
                        {getPrimaryImage(p.images, p.coverImageUrl) && (
                          <img src={getPrimaryImage(p.images, p.coverImageUrl)} alt="" className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        )}
                        <div className="absolute top-2 right-2"><SaveButton propertyId={p._id} /></div>
                      </div>
                      <Link to={`/properties/${p._id}`} className="font-display font-semibold text-navy-900 hover:underline block">{p.projectName}</Link>
                      <p className="text-xs text-navy-500 mt-0.5">{p.title}</p>
                      <button onClick={() => remove(p._id)} className="text-xs text-navy-400 hover:text-red-600 mt-2">Remove</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-t border-navy-100">
                    <th scope="row" className="sticky left-0 bg-cream-50 z-10 text-left font-medium text-navy-600 px-4 py-3 align-top">{r.label}</th>
                    {props.map((p, i) => (
                      <td key={p._id} className="px-4 py-3 text-navy-800 align-top border-l border-navy-100">{r.render(p, i)}</td>
                    ))}
                  </tr>
                ))}
                {amenityUnion.length > 0 && (
                  <>
                    <tr className="border-t-2 border-navy-200">
                      <th scope="row" className="sticky left-0 bg-cream-100 z-10 text-left font-semibold text-navy-800 px-4 py-3" colSpan={props.length + 1}>Amenities</th>
                    </tr>
                    {amenityUnion.map((a) => (
                      <tr key={a} className="border-t border-navy-50">
                        <th scope="row" className="sticky left-0 bg-cream-50 z-10 text-left font-normal text-navy-600 px-4 py-2">{a}</th>
                        {props.map((p) => (
                          <td key={p._id} className="px-4 py-2 border-l border-navy-100">
                            {p.amenities.includes(a)
                              ? <span className="text-green-600 font-semibold" aria-label="Yes">✓</span>
                              : <span className="text-navy-300" aria-label="No">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {user?.role === 'CUSTOMER' && <CustomerMobileNav />}
    </div>
  );
}
