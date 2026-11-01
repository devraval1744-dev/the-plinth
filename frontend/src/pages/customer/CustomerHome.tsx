import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import CustomerMobileNav from '../../components/layout/CustomerMobileNav';
import PropertyCard from '../../components/property/PropertyCard';
import HomeSearch from '../../components/home/HomeSearch';
import ConnectDsaModal from '../../components/dsa/ConnectDsaModal';
import EmptyState, { SectionError } from '../../components/ui/EmptyState';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import {
  LocalityExplorer,
  SectionHeader,
  StatsRow,
  TasteProfilePanel,
  UpNextPanel,
} from '../../components/home/HomeSections';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { clearHistoryApi, getDashboardApi, getRecommendationsApi } from '../../api/customer.api';
import { getLocalityStatsApi, getSimilarPropertiesApi, getTrendingApi } from '../../api/properties.api';
import { getErrorMessage } from '../../api/client';
import { greeting, searchLabel, searchToQueryString } from '../../utils/format';

export default function CustomerHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const favorites = useFavorites();
  const [dsaOpen, setDsaOpen] = useState(false);

  // Each block loads independently so one slow or failing call never blanks the page
  const dashboard = useAsync(getDashboardApi, []);
  const feed = useAsync(() => getRecommendationsApi(8), []);
  const trending = useAsync(() => getTrendingApi(8), []);
  const localities = useAsync(getLocalityStatsApi, []);

  const recentViews = dashboard.data?.recentViews ?? [];
  const anchor = recentViews[0];
  const similar = useAsync(() => getSimilarPropertiesApi(anchor!._id, 8), [anchor?._id], Boolean(anchor));

  const firstName = user?.name?.split(' ')[0] ?? '';
  const isFirstVisit = (user?.loginCount ?? 1) <= 1;
  const recent = dashboard.data?.recentSearches ?? [];

  const refreshPersonalisation = () => {
    dashboard.reload();
    feed.reload();
  };

  const clearHistory = async () => {
    try {
      await clearHistoryApi();
      toast.success('Your browsing history has been cleared');
      refreshPersonalisation();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const feedItems = feed.data?.items ?? [];
  const personalised = feed.data?.isPersonalized ?? false;

  // Each listing appears once on the page: later sections skip what earlier ones already show
  const shown = new Set<string>([...feedItems.map((r) => r.property._id), ...recentViews.slice(0, 4).map((p) => p._id)]);
  const similarItems = (similar.data ?? []).filter((p) => !shown.has(p._id)).slice(0, 4);
  similarItems.forEach((p) => shown.add(p._id));
  // For brand-new customers the feed *is* the trending list, so a second copy would be noise
  const trendingItems = personalised
    ? (trending.data?.properties ?? []).filter((p) => !shown.has(p._id)).slice(0, 4)
    : [];

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />

      <main className="page-container py-6 sm:py-8 space-y-10 pb-28 sm:pb-12">
        {/* ── Hero: greeting + search ───────────────────────────────────────── */}
        <section className="rounded-2xl bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 px-5 sm:px-8 py-7 text-cream-100 shadow-card-hover">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="font-display text-3xl font-semibold">
                {isFirstVisit ? 'Welcome' : greeting()}, {firstName}
              </h1>
              <p className="text-navy-200 mt-1">
                {dashboard.data?.nextVisit
                  ? 'You have a site visit coming up — details below.'
                  : 'Discover your next home in Ahmedabad.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="btn border border-navy-400 text-cream-100 hover:bg-navy-700" onClick={() => navigate('/customer/profile')}>
                My Profile
              </button>
              <button className="btn-gold" onClick={() => navigate('/properties')}>Browse Properties</button>
            </div>
          </div>

          <HomeSearch />

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            {recent.length > 0 ? (
              <>
                <span className="text-navy-300">Recent searches:</span>
                {recent.map((r) => (
                  <Link
                    key={r.createdAt + searchLabel(r.query)}
                    to={`/properties${searchToQueryString(r.query)}`}
                    className="rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-cream-100 transition-colors"
                  >
                    {searchLabel(r.query)}
                  </Link>
                ))}
              </>
            ) : (
              <>
                <span className="text-navy-300">Popular:</span>
                {(localities.data ?? []).slice(0, 5).map((l) => (
                  <Link
                    key={l.locality}
                    to={`/properties?locality=${encodeURIComponent(l.locality)}`}
                    className="rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-cream-100 transition-colors"
                  >
                    {l.locality}
                  </Link>
                ))}
              </>
            )}
          </div>
        </section>

        {/* ── Activity ──────────────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Your Activity" />
          {dashboard.error && <div className="mb-4"><SectionError message={dashboard.error} onRetry={dashboard.reload} /></div>}
          <StatsRow
            data={dashboard.data}
            savedCount={favorites.ready ? favorites.count : null}
            loading={dashboard.loading}
            onIntelligenceClick={() => document.getElementById('for-you')?.scrollIntoView({ behavior: 'smooth' })}
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <UpNextPanel data={dashboard.data} loading={dashboard.loading} hasPhone={Boolean(user?.phone)} />
          </div>
          <TasteProfilePanel
            insights={dashboard.data?.insights ?? null}
            loading={dashboard.loading}
            onClearHistory={clearHistory}
          />
        </section>

        {/* ── Recommended for you ──────────────────────────────────────────── */}
        <section>
          <SectionHeader
            id="for-you"
            title="Recommended for you"
            subtitle={
              feed.loading ? undefined
              : personalised ? 'Picked from your searches, views and saves — and what similar buyers liked.'
              : 'Trending picks to get you started. Browse a few homes and these will become personal.'
            }
            action={<Link to="/properties" className="text-sm font-medium text-navy-700 hover:underline whitespace-nowrap">Browse all →</Link>}
          />
          {feed.loading ? (
            <CardGridSkeleton count={4} />
          ) : feed.error ? (
            <SectionError message={feed.error} onRetry={feed.reload} />
          ) : feedItems.length === 0 ? (
            <EmptyState icon="🏙️" title="No properties to recommend yet" message="New listings appear here as soon as builders publish them." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {feedItems.map((r) => (
                <PropertyCard key={r.property._id} property={r.property} matchScore={r.matchScore} reasons={r.reasons} />
              ))}
            </div>
          )}
        </section>

        {/* ── Pick up where you left off ───────────────────────────────────── */}
        {recentViews.length > 0 && (
          <section>
            <SectionHeader title="Pick up where you left off" subtitle="Properties you looked at recently" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {recentViews.slice(0, 4).map((p) => <PropertyCard key={p._id} property={p} />)}
            </div>
          </section>
        )}

        {/* ── Because you viewed … ─────────────────────────────────────────── */}
        {anchor && (similar.loading || similarItems.length > 0) && (
          <section>
            <SectionHeader title={`Because you viewed ${anchor.projectName}`} subtitle="Similar homes by location, budget and layout" />
            {similar.loading ? <CardGridSkeleton count={4} /> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {similarItems.map((p) => (
                  <PropertyCard key={p._id} property={p} reasons={[`${p.similarity}% similar to ${anchor.projectName}`]} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Trending ─────────────────────────────────────────────────────── */}
        {personalised && (trending.loading || trendingItems.length > 0) && (
          <section>
            <SectionHeader
              title={trending.data?.hasActivity === false ? 'New on The Plinth' : 'Trending in Ahmedabad'}
              subtitle={trending.data?.hasActivity === false ? 'More of the latest approved listings' : 'What buyers are engaging with this week'}
            />
            {trending.loading ? <CardGridSkeleton count={4} /> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {trendingItems.map((p) => (
                  <PropertyCard
                    key={p._id}
                    property={p}
                    highlight={p.trending.viewers >= 2 ? `${p.trending.viewers} buyers engaged this week` : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Explore localities ───────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Explore Localities" subtitle="Live inventory and starting prices across Ahmedabad" />
          {localities.error
            ? <SectionError message={localities.error} onRetry={localities.reload} />
            : <LocalityExplorer stats={localities.data} loading={localities.loading} />}
        </section>

        {/* ── Next steps ───────────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Take the next step" subtitle="Compare, visit, and talk to a verified DSA partner" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Link to="/compare" className="card px-6 py-6 block hover:shadow-card-hover transition-shadow">
              <p className="text-3xl mb-2" aria-hidden="true">⇄</p>
              <h3 className="font-display text-lg font-semibold text-navy-800">Compare homes side by side</h3>
              <p className="text-sm text-navy-500 mt-1">Add up to 3 properties from any search and compare price, size, amenities and more.</p>
              <p className="text-xs font-medium text-navy-600 mt-3">Open comparison →</p>
            </Link>
            <Link to="/visits" className="card px-6 py-6 block hover:shadow-card-hover transition-shadow">
              <p className="text-3xl mb-2" aria-hidden="true">📅</p>
              <h3 className="font-display text-lg font-semibold text-navy-800">See it in person</h3>
              <p className="text-sm text-navy-500 mt-1">Request a site visit from any property page and track the builder's reply here.</p>
              <p className="text-xs font-medium text-navy-600 mt-3">My site visits →</p>
            </Link>
            <button onClick={() => setDsaOpen(true)} className="card px-6 py-6 block text-left hover:shadow-card-hover transition-shadow">
              <p className="text-3xl mb-2" aria-hidden="true">🤝</p>
              <h3 className="font-display text-lg font-semibold text-navy-800">Connect with a DSA</h3>
              <p className="text-sm text-navy-500 mt-1">A verified partner will reach out and guide you through financing — we just make the introduction.</p>
              <p className="text-xs font-medium text-navy-600 mt-3">Get connected →</p>
            </button>
          </div>
        </section>
      </main>

      <ConnectDsaModal open={dsaOpen} onClose={() => setDsaOpen(false)} onCreated={refreshPersonalisation} />
      <CustomerMobileNav />
    </div>
  );
}
