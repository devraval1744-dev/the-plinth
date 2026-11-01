import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import CustomerMobileNav from '../../components/layout/CustomerMobileNav';
import PropertyCard from '../../components/property/PropertyCard';
import EmptyState, { SectionError } from '../../components/ui/EmptyState';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { discoverPropertiesApi } from '../../api/properties.api';
import { recordSearchApi } from '../../api/customer.api';
import { formatPriceCompact } from '../../utils/format';
import {
  PROPERTY_TYPES,
  CONSTRUCTION_STATUSES,
  BHK_TYPES,
  AHMEDABAD_LOCALITIES,
} from '../../types';
import type { PropertyDiscoveryQuery, SearchQuery } from '../../types';

const PRICE_OPTIONS = [
  { label: 'Any', value: '' },
  { label: 'Under ₹30L', value: '3000000' },
  { label: 'Under ₹50L', value: '5000000' },
  { label: 'Under ₹75L', value: '7500000' },
  { label: 'Under ₹1 Cr', value: '10000000' },
  { label: 'Under ₹1.5 Cr', value: '15000000' },
  { label: 'Under ₹2 Cr', value: '20000000' },
];

const SORT_OPTIONS = [
  { label: 'Newest First', value: 'newest' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
  { label: 'Area: Smallest First', value: 'area_asc' },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]['value'];

const PAGE_SIZE = 12;

export default function PropertyDiscoveryPage() {
  const { user, isAuthenticated } = useAuth();
  // The URL is the single source of truth: shareable, refresh-safe, and the back button works
  const [params, setParams] = useSearchParams();

  const search = params.get('search') || '';
  const locality = params.get('locality') || '';
  const propertyType = params.get('propertyType') || '';
  const bhk = params.get('bhk') || '';
  const constructionStatus = params.get('constructionStatus') || '';
  const maxPriceRaw = Number(params.get('maxPrice'));
  const maxPrice = Number.isFinite(maxPriceRaw) && maxPriceRaw > 0 ? maxPriceRaw : undefined;
  const sortParam = params.get('sortBy') as SortKey | null;
  const sortBy: SortKey = SORT_OPTIONS.some((o) => o.value === sortParam) ? (sortParam as SortKey) : 'newest';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => { setSearchInput(search); }, [search]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [page]);

  const activeFilterCount = [locality, propertyType, bhk, constructionStatus, maxPrice, search.trim()].filter(Boolean).length;
  const [showFilters, setShowFilters] = useState(activeFilterCount > 0);

  const update = (changes: Record<string, string | undefined>, keepPage = false) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => { if (v) next.set(k, v); else next.delete(k); });
    if (!keepPage) next.delete('page');
    setParams(next);
  };

  const result = useAsync(() => {
    const query: PropertyDiscoveryQuery = {
      search: search.trim() || undefined,
      locality: locality || undefined,
      propertyType: propertyType || undefined,
      bhk: bhk || undefined,
      constructionStatus: constructionStatus || undefined,
      maxPrice,
      sortBy,
      page,
      limit: PAGE_SIZE,
    };
    return discoverPropertiesApi(query);
  }, [params.toString()]);

  // Tell the recommender what this customer is looking for (once per distinct search)
  const lastRecorded = useRef('');
  useEffect(() => {
    if (!result.data || user?.role !== 'CUSTOMER' || page > 1) return;
    const q: SearchQuery = {
      search: search.trim().length >= 2 ? search.trim() : undefined,
      locality: locality || undefined,
      propertyType: propertyType || undefined,
      bhk: bhk || undefined,
      maxPrice,
      constructionStatus: constructionStatus || undefined,
    };
    if (!Object.values(q).some((v) => v !== undefined)) return;
    const signature = JSON.stringify(q);
    if (lastRecorded.current === signature) return;
    lastRecorded.current = signature;
    recordSearchApi(q).catch(() => { /* personalisation is best-effort */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.data]);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    update({ search: searchInput.trim() || undefined });
  };

  const clearFilters = () => {
    setSearchInput('');
    setParams(new URLSearchParams());
  };

  const chips: { label: string; clear: () => void }[] = [];
  if (search.trim()) chips.push({ label: `“${search.trim()}”`, clear: () => update({ search: undefined }) });
  if (locality) chips.push({ label: locality, clear: () => update({ locality: undefined }) });
  if (propertyType) chips.push({ label: propertyType, clear: () => update({ propertyType: undefined }) });
  if (bhk) chips.push({ label: bhk, clear: () => update({ bhk: undefined }) });
  if (constructionStatus) chips.push({ label: constructionStatus, clear: () => update({ constructionStatus: undefined }) });
  if (maxPrice) chips.push({ label: `Under ${formatPriceCompact(maxPrice)}`, clear: () => update({ maxPrice: undefined }) });

  const properties = result.data?.properties ?? [];
  const total = result.data?.total ?? 0;
  const pages = result.data?.pages ?? 1;

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />

      <main className="page-container py-8 space-y-6 pb-28 sm:pb-12">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">Find Your Home</h1>
            <p className="text-navy-500 mt-1" aria-live="polite">
              {result.loading ? 'Searching…'
                : total > 0 ? `${total} approved propert${total === 1 ? 'y' : 'ies'} found`
                : 'Discover properties in Ahmedabad'}
            </p>
          </div>
          <button
            type="button"
            onClick={result.reload}
            disabled={result.loading}
            className="btn btn-secondary text-xs px-3 py-2"
            title="Refresh results"
          >
            <span aria-hidden="true">🔄</span> Refresh
          </button>
        </div>

        {!isAuthenticated && (
          <p className="text-sm text-navy-600 bg-white border border-navy-100 rounded-xl px-4 py-3">
            <Link to="/login" className="font-semibold text-navy-800 underline">Log in</Link> or{' '}
            <Link to="/signup" className="font-semibold text-navy-800 underline">sign up</Link> to save properties,
            book site visits and get recommendations tailored to you.
          </p>
        )}

        {/* Search + filter bar */}
        <div className="card px-5 py-4 space-y-4">
          <form onSubmit={submitSearch} className="flex flex-col sm:flex-row gap-3" role="search">
            <label className="flex-1">
              <span className="sr-only">Search properties</span>
              <input
                className="input"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by project, locality or builder…"
              />
            </label>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary whitespace-nowrap">Search</button>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                className={`btn-secondary whitespace-nowrap flex items-center gap-1.5 ${activeFilterCount > 0 ? 'border-gold-500 text-gold-600' : ''}`}
              >
                Filters
                {activeFilterCount > 0 && (
                  <span className="bg-gold-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">{activeFilterCount}</span>
                )}
              </button>
            </div>
          </form>

          {showFilters && (
            <div className="border-t border-navy-100 pt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <label>
                <span className="label text-xs">Locality</span>
                <select className="input text-sm" value={locality} onChange={(e) => update({ locality: e.target.value || undefined })}>
                  <option value="">Any</option>
                  {AHMEDABAD_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label>
                <span className="label text-xs">Property type</span>
                <select className="input text-sm" value={propertyType} onChange={(e) => update({ propertyType: e.target.value || undefined })}>
                  <option value="">Any</option>
                  {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label>
                <span className="label text-xs">BHK</span>
                <select className="input text-sm" value={bhk} onChange={(e) => update({ bhk: e.target.value || undefined })}>
                  <option value="">Any</option>
                  {BHK_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label>
                <span className="label text-xs">Max price</span>
                <select className="input text-sm" value={maxPrice?.toString() || ''} onChange={(e) => update({ maxPrice: e.target.value || undefined })}>
                  {PRICE_OPTIONS.map(({ label, value }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                <span className="label text-xs">Status</span>
                <select className="input text-sm" value={constructionStatus} onChange={(e) => update({ constructionStatus: e.target.value || undefined })}>
                  <option value="">Any</option>
                  {CONSTRUCTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-100 pt-3">
            <div className="flex flex-wrap items-center gap-2 min-h-[1.75rem]">
              {chips.map((c) => (
                <span key={c.label} className="inline-flex items-center gap-1 bg-navy-100 text-navy-800 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium">
                  {c.label}
                  <button onClick={c.clear} className="w-4 h-4 rounded-full hover:bg-navy-200 leading-none" aria-label={`Remove filter ${c.label}`}>×</button>
                </span>
              ))}
              {chips.length > 1 && (
                <button onClick={clearFilters} className="text-xs text-navy-500 hover:text-red-600 transition-colors">Clear all</button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-navy-600">
              Sort by
              <select className="input text-sm w-auto py-1.5" value={sortBy} onChange={(e) => update({ sortBy: e.target.value === 'newest' ? undefined : e.target.value })}>
                {SORT_OPTIONS.map(({ label, value }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* Results */}
        {result.loading ? (
          <CardGridSkeleton count={6} />
        ) : result.error ? (
          <SectionError message={result.error} onRetry={result.reload} />
        ) : properties.length === 0 ? (
          <EmptyState
            icon="🏠"
            title="No properties found"
            message="Try adjusting your search or removing a filter."
            action={activeFilterCount > 0 ? <button onClick={clearFilters} className="btn-secondary">Clear filters</button> : undefined}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {properties.map((p) => <PropertyCard key={p._id} property={p} />)}
            </div>

            {pages > 1 && (
              <nav className="flex items-center justify-center gap-2 pt-4" aria-label="Pagination">
                <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, true)}
                  className="btn-secondary btn px-4 py-2 disabled:opacity-40">← Prev</button>
                <span className="text-sm text-navy-600">Page {page} of {pages}</span>
                <button disabled={page >= pages} onClick={() => update({ page: String(page + 1) }, true)}
                  className="btn-secondary btn px-4 py-2 disabled:opacity-40">Next →</button>
              </nav>
            )}
          </>
        )}
      </main>

      {user?.role === 'CUSTOMER' && <CustomerMobileNav />}
    </div>
  );
}
