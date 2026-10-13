import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import AlertMessage from '../../components/ui/AlertMessage';
import { discoverPropertiesApi } from '../../api/properties.api';
import { getErrorMessage } from '../../api/client';
import { formatPriceRange, getBuilderName, getPrimaryImage } from '../../utils/format';
import {
  PROPERTY_TYPES,
  CONSTRUCTION_STATUSES,
  BHK_TYPES,
  AHMEDABAD_LOCALITIES,
} from '../../types';
import type { Property, PropertyDiscoveryQuery } from '../../types';

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
];

function PropertyCard({ property, onClick }: { property: Property; onClick: () => void }) {
  const primaryImage = getPrimaryImage(property.images, property.coverImageUrl);
  const bhkLabels = [...new Set(property.bhkConfigurations.map((b) => b.type))].join(' · ');
  const builderName = getBuilderName(property.builderId as any);

  return (
    <div onClick={onClick} className="card-hover overflow-hidden group">
      {/* Image */}
      <div className="h-48 bg-navy-100 relative overflow-hidden">
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={property.projectName}
            onError={(e) => {
              // Safe fallback: try frontend local demo fallback if uploads path fails or show fallback
              const target = e.currentTarget;
              if (!target.src.includes('/demo/demo_property_1.jpg')) {
                target.src = '/demo/demo_property_1.jpg';
              } else {
                target.style.display = 'none';
              }
            }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl opacity-30">🏗️</span>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className={`badge text-xs ${
            property.constructionStatus === 'Ready to Move' ? 'bg-green-100 text-green-800'
            : property.constructionStatus === 'New Launch' ? 'bg-gold-500 text-white'
            : 'bg-navy-800/80 text-cream-100'
          }`}>{property.constructionStatus}</span>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4 space-y-2">
        <div>
          <h3 className="font-display font-semibold text-navy-900 text-base leading-snug line-clamp-1">
            {property.projectName}
          </h3>
          <p className="text-xs text-navy-500 mt-0.5">{property.title}</p>
        </div>

        <div className="flex items-center gap-1 text-xs text-navy-500">
          <span>📍</span>
          <span>{property.locality}, {property.city}</span>
        </div>

        {bhkLabels && (
          <p className="text-xs text-navy-600 font-medium">{bhkLabels}</p>
        )}

        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="price-text-sm">
              {formatPriceRange(property.minPrice, property.maxPrice)}
            </p>
            <p className="text-xs text-navy-400">{property.minArea}–{property.maxArea} sq.ft</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-navy-500">{builderName}</p>
            {property.availableUnits > 0 && (
              <p className="text-xs text-green-600 font-medium">{property.availableUnits} units left</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PropertyDiscoveryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [filters, setFilters] = useState<PropertyDiscoveryQuery>({
    locality: searchParams.get('locality') || '',
    propertyType: searchParams.get('propertyType') || '',
    bhk: searchParams.get('bhk') || '',
    maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
    constructionStatus: searchParams.get('constructionStatus') || '',
    sortBy: (searchParams.get('sortBy') as any) || 'newest',
  });

  const [properties, setProperties] = useState<Property[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchProperties = useCallback(async (p = 1) => {
    setIsLoading(true); setError('');
    try {
      const query: PropertyDiscoveryQuery = {
        ...filters,
        search: search.trim() || undefined,
        page: p,
        limit: 12,
      };
      // Remove empty strings
      (Object.keys(query) as (keyof PropertyDiscoveryQuery)[]).forEach((k) => {
        if (query[k] === '' || query[k] === undefined) delete query[k];
      });
      const result = await discoverPropertiesApi(query);
      setProperties(result.properties as Property[]);
      setTotal(result.total);
      setPages(result.pages);
      setPage(result.page);
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setIsLoading(false); }
  }, [filters, search]);

  useEffect(() => { fetchProperties(1); }, [filters]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    fetchProperties(1);
  };

  const setFilter = (key: keyof PropertyDiscoveryQuery, value: string | number | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  };

  const clearFilters = () => {
    setSearch('');
    setFilters({ sortBy: 'newest' });
  };

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => k !== 'sortBy' && v !== undefined && v !== ''
  ).length + (search.trim() ? 1 : 0);

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />

      <main className="page-container py-8 space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">Find Your Home</h1>
            <p className="text-navy-500 mt-1">
              {total > 0 ? `${total} approved propert${total === 1 ? 'y' : 'ies'} available` : 'Discover properties in Ahmedabad'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchProperties(page)}
            disabled={isLoading}
            className="btn btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
            title="Refresh approved properties"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {/* Search + filter bar */}
        <div className="card px-5 py-4 space-y-4">
          <form onSubmit={handleSearch} className="flex gap-3">
            <input
              className="input flex-1"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by project, locality or builder…"
            />
            <button type="submit" className="btn-primary whitespace-nowrap">Search</button>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`btn-secondary whitespace-nowrap flex items-center gap-1.5 ${activeFilterCount > 0 ? 'border-gold-500 text-gold-600' : ''}`}
            >
              Filters {activeFilterCount > 0 && <span className="bg-gold-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">{activeFilterCount}</span>}
            </button>
          </form>

          {showFilters && (
            <div className="border-t border-navy-100 pt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <label className="label text-xs">Locality</label>
                <select className="input text-sm" value={filters.locality || ''}
                  onChange={(e) => setFilter('locality', e.target.value)}>
                  <option value="">Any</option>
                  {AHMEDABAD_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Property type</label>
                <select className="input text-sm" value={filters.propertyType || ''}
                  onChange={(e) => setFilter('propertyType', e.target.value)}>
                  <option value="">Any</option>
                  {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">BHK</label>
                <select className="input text-sm" value={filters.bhk || ''}
                  onChange={(e) => setFilter('bhk', e.target.value)}>
                  <option value="">Any</option>
                  {BHK_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Max price</label>
                <select className="input text-sm" value={filters.maxPrice?.toString() || ''}
                  onChange={(e) => setFilter('maxPrice', e.target.value ? Number(e.target.value) : undefined)}>
                  {PRICE_OPTIONS.map(({ label, value }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Status</label>
                <select className="input text-sm" value={filters.constructionStatus || ''}
                  onChange={(e) => setFilter('constructionStatus', e.target.value)}>
                  <option value="">Any</option>
                  {CONSTRUCTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="col-span-2 sm:col-span-3 lg:col-span-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="label text-xs mb-0">Sort by</label>
                  <select className="input text-sm w-auto" value={filters.sortBy || 'newest'}
                    onChange={(e) => setFilter('sortBy', e.target.value)}>
                    {SORT_OPTIONS.map(({ label, value }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-xs text-navy-500 hover:text-red-600 transition-colors">
                    Clear all filters
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {error && <AlertMessage type="error" message={error} />}

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24"><LoadingSpinner size="lg" /></div>
        ) : properties.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <div className="text-5xl">🏠</div>
            <p className="font-display text-xl font-semibold text-navy-700">No properties found</p>
            <p className="text-navy-500 text-sm">Try adjusting your search or filters.</p>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="btn-secondary btn mt-2">Clear Filters</button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {properties.map((p) => (
                <PropertyCard key={p._id} property={p}
                  onClick={() => navigate(`/properties/${p._id}`)} />
              ))}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button disabled={page <= 1} onClick={() => fetchProperties(page - 1)}
                  className="btn-secondary btn px-4 py-2 disabled:opacity-40">← Prev</button>
                <span className="text-sm text-navy-600">Page {page} of {pages}</span>
                <button disabled={page >= pages} onClick={() => fetchProperties(page + 1)}
                  className="btn-secondary btn px-4 py-2 disabled:opacity-40">Next →</button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
