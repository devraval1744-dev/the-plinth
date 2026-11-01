import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import CustomerMobileNav from '../../components/layout/CustomerMobileNav';
import PropertyCard from '../../components/property/PropertyCard';
import EmptyState, { SectionError } from '../../components/ui/EmptyState';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import { useAsync } from '../../hooks/useAsync';
import { listFavoritesApi } from '../../api/customer.api';

type Sort = 'recent' | 'price_asc' | 'price_desc';

export default function SavedPropertiesPage() {
  const saved = useAsync(listFavoritesApi, []);
  const [sort, setSort] = useState<Sort>('recent');

  const items = useMemo(() => {
    const list = [...(saved.data ?? [])];
    if (sort === 'price_asc') list.sort((a, b) => a.minPrice - b.minPrice);
    else if (sort === 'price_desc') list.sort((a, b) => b.maxPrice - a.maxPrice);
    return list; // 'recent' keeps the server order (newest saved first)
  }, [saved.data, sort]);

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />
      <main className="page-container py-8 space-y-6 pb-28 sm:pb-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">Saved properties</h1>
            <p className="text-navy-500 mt-1">
              {saved.data ? `${saved.data.length} ${saved.data.length === 1 ? 'property' : 'properties'} on your shortlist` : 'Your shortlist'}
            </p>
          </div>
          {items.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-navy-600">
              Sort by
              <select className="input w-auto text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="recent">Recently saved</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </label>
          )}
        </div>

        {saved.loading ? (
          <CardGridSkeleton count={4} />
        ) : saved.error ? (
          <SectionError message={saved.error} onRetry={saved.reload} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="🔖"
            title="Nothing saved yet"
            message="Tap the heart on any property to build a shortlist you can come back to — and compare."
            action={<Link to="/properties" className="btn-primary">Browse properties</Link>}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {items.map((p) => <PropertyCard key={p._id} property={p} />)}
          </div>
        )}
      </main>
      <CustomerMobileNav />
    </div>
  );
}
