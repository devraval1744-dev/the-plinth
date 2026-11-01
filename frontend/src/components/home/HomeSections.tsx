import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../ui/Skeleton';
import { VisitStatusPill, LoanStatusPill } from '../ui/StatusPill';
import { formatPriceCompact, formatVisitDate } from '../../utils/format';
import { AHMEDABAD_LOCALITIES } from '../../types';
import type { CustomerDashboard, LocalityStat, ProfileInsights } from '../../types';

// ─── Section header ──────────────────────────────────────────────────────────

export function SectionHeader({
  id, title, subtitle, action,
}: { id?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div id={id} className="flex items-end justify-between gap-4 mb-4 scroll-mt-24">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="text-sm text-navy-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Activity stat cards ─────────────────────────────────────────────────────

function StatCard({
  to, onClick, icon, value, label, note, loading,
}: {
  to?: string; onClick?: () => void; icon: ReactNode; value: ReactNode; label: string; note?: string; loading: boolean;
}) {
  const body = (
    <>
      <div className="text-2xl mb-3" aria-hidden="true">{icon}</div>
      {loading ? (
        <Skeleton className="h-7 w-14 mb-2" />
      ) : (
        <div className="font-display text-2xl font-semibold text-navy-800">{value}</div>
      )}
      <div className="text-sm font-medium text-navy-700 mt-1">{label}</div>
      {note && !loading && <div className="text-xs text-navy-400 mt-1">{note}</div>}
    </>
  );
  const cls = 'card px-5 py-5 block text-left w-full hover:shadow-card-hover hover:-translate-y-0.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500';
  return to ? (
    <Link to={to} className={cls}>{body}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{body}</button>
  );
}

export function StatsRow({
  data, savedCount, loading, onIntelligenceClick,
}: {
  data: CustomerDashboard | null; savedCount: number | null; loading: boolean; onIntelligenceClick: () => void;
}) {
  const c = data?.counts;
  const strength = data?.insights.profileStrength ?? 0;
  const signals = data?.insights.signalCount ?? 0;
  const saved = savedCount ?? c?.saved ?? 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard to="/saved" icon="🔖" value={saved} label="Saved Properties"
        note={saved > 0 ? 'View your shortlist' : 'Tap ♡ on any listing'} loading={loading && savedCount === null} />
      <StatCard to="/visits" icon="🏠" value={c?.visitsUpcoming ?? 0} label="Site Visits"
        note={c && c.visitsTotal > 0 ? `${c.visitsUpcoming} upcoming · ${c.visitsTotal} total` : 'Book your first visit'} loading={loading} />
      <StatCard to="/dsa-connect" icon="🤝" value={c?.loansActive ?? 0} label="DSA Connections"
        note={c && c.loansTotal > 0 ? `${c.loansActive} active · ${c.loansTotal} total` : 'Connect with a DSA'} loading={loading} />
      <StatCard onClick={onIntelligenceClick} icon="🧠"
        value={signals > 0 ? `${strength}%` : 'Learning'} label="Plinth Intelligence"
        note={signals > 0 ? `Personalised from ${signals} ${signals === 1 ? 'signal' : 'signals'}` : 'Browse to personalise'} loading={loading} />
    </div>
  );
}

// ─── Up next ─────────────────────────────────────────────────────────────────

function UpNextItem({
  to, image, title, meta, status, accent, cta,
}: {
  to: string; image?: string; title: string; meta: string; status: ReactNode; accent?: boolean; cta: string;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors hover:bg-cream-50 ${
        accent ? 'border-indigo-300 bg-indigo-50/60' : 'border-navy-100'
      }`}
    >
      <div className="w-14 h-14 rounded-lg bg-navy-100 overflow-hidden shrink-0 flex items-center justify-center">
        {image ? <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" /> : <span aria-hidden="true">🏗️</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-navy-800 truncate">{title}</p>
        <p className="text-xs text-navy-500 mt-0.5 truncate">{meta}</p>
        <div className="mt-1.5">{status}</div>
      </div>
      <span className="text-xs font-medium text-navy-600 shrink-0 hidden sm:block">{cta} →</span>
    </Link>
  );
}

export function UpNextPanel({
  data, loading, hasPhone,
}: { data: CustomerDashboard | null; loading: boolean; hasPhone: boolean }) {
  const visit = data?.nextVisit;
  const loan = data?.latestLoan && ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'DOCUMENTS_REQUIRED'].includes(data.latestLoan.status)
    ? data.latestLoan : null;
  const unread = data?.counts.unreadNotifications ?? 0;

  return (
    <div className="card px-6 py-6 h-full">
      <h3 className="font-display text-lg font-semibold text-navy-800 mb-4">Up next</h3>
      {loading ? (
        <div className="space-y-3"><Skeleton className="h-[4.5rem] w-full" /><Skeleton className="h-[4.5rem] w-full" /></div>
      ) : (
        <div className="space-y-3">
          {visit && (
            <UpNextItem
              to="/visits"
              accent={visit.status === 'RESCHEDULE_PROPOSED'}
              image={visit.property?.coverImageUrl}
              title={`Site visit · ${visit.property?.projectName ?? 'Property'}`}
              meta={
                visit.status === 'RESCHEDULE_PROPOSED' && visit.proposedDate
                  ? `New time proposed: ${formatVisitDate(visit.proposedDate)}, ${visit.proposedSlotLabel}`
                  : `${formatVisitDate(visit.visitDate)} · ${visit.timeSlotLabel}`
              }
              status={<VisitStatusPill status={visit.status} />}
              cta={visit.status === 'RESCHEDULE_PROPOSED' ? 'Respond' : 'Manage'}
            />
          )}
          {loan && (
            <UpNextItem
              to="/dsa-connect"
              accent={loan.status === 'DOCUMENTS_REQUIRED'}
              image={loan.property?.coverImageUrl}
              title={`DSA connection${loan.property ? ` · ${loan.property.projectName}` : ''}`}
              meta={loan.dsa ? `With ${loan.dsa.name}` : 'Waiting for a DSA partner'}
              status={<LoanStatusPill status={loan.status} />}
              cta="Track"
            />
          )}
          {unread > 0 && (
            <Link to="/notifications" className="flex items-center justify-between rounded-xl border border-navy-100 px-4 py-3 text-sm hover:bg-cream-50">
              <span className="text-navy-700"><span aria-hidden="true">🔔</span> You have <strong>{unread}</strong> unread {unread === 1 ? 'notification' : 'notifications'}</span>
              <span className="text-xs font-medium text-navy-600">Open →</span>
            </Link>
          )}
          {!hasPhone && (
            <Link to="/customer/profile" className="flex items-center justify-between rounded-xl border border-dashed border-navy-200 px-4 py-3 text-sm hover:bg-cream-50">
              <span className="text-navy-600"><span aria-hidden="true">📱</span> Add your mobile number to book visits and connect with DSAs faster</span>
              <span className="text-xs font-medium text-navy-600 shrink-0 ml-3">Add →</span>
            </Link>
          )}
          {!visit && !loan && unread === 0 && (
            <div className="text-center py-5 space-y-2">
              <p className="text-3xl" aria-hidden="true">🗓️</p>
              <p className="font-medium text-navy-700">Nothing scheduled yet</p>
              <p className="text-sm text-navy-500">Found a place you like? Book a site visit to see it in person.</p>
              <Link to="/properties" className="btn-primary mt-2">Browse properties</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Taste profile ───────────────────────────────────────────────────────────

function Chips({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => <span key={i} className="badge-navy">{i}</span>)}
      </div>
    </div>
  );
}

export function TasteProfilePanel({
  insights, loading, onClearHistory,
}: { insights: ProfileInsights | null; loading: boolean; onClearHistory: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const empty = !insights || insights.signalCount === 0;

  return (
    <div className="card px-6 py-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-semibold text-navy-800">What we've learned</h3>
        {!empty && <span className="text-xs font-semibold text-gold-600">{insights!.profileStrength}% tuned</span>}
      </div>

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-2 w-full" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
      ) : empty ? (
        <p className="text-sm text-navy-500">
          Search, view and save a few homes and we'll learn your taste — then tailor suggestions to your
          locality, budget and layout preferences.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="h-2 rounded-full bg-navy-100 overflow-hidden" role="progressbar"
            aria-valuenow={insights!.profileStrength} aria-valuemin={0} aria-valuemax={100} aria-label="Profile strength">
            <div className="h-full bg-gradient-to-r from-gold-500 to-gold-400 transition-all" style={{ width: `${insights!.profileStrength}%` }} />
          </div>
          <Chips label="Areas you like" items={insights!.topLocalities} />
          <Chips label="Layouts" items={insights!.topBhks} />
          <Chips label="Property type" items={insights!.topTypes} />
          {insights!.budget && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400 mb-1.5">Budget range</p>
              <p className="text-sm font-semibold text-navy-800">
                {formatPriceCompact(insights!.budget.min)} – {formatPriceCompact(insights!.budget.max)}
              </p>
            </div>
          )}
        </div>
      )}

      {!empty && (
        <div className="mt-5 pt-4 border-t border-navy-100">
          {confirming ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-navy-600">Clear searches & views?</span>
              <button
                disabled={busy}
                onClick={async () => { setBusy(true); try { await onClearHistory(); } finally { setBusy(false); setConfirming(false); } }}
                className="font-semibold text-red-600 hover:underline disabled:opacity-50"
              >
                {busy ? 'Clearing…' : 'Yes, clear'}
              </button>
              <button onClick={() => setConfirming(false)} className="text-navy-500 hover:underline">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} className="text-xs text-navy-500 hover:text-red-600 transition-colors">
              Reset my personalisation
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Locality explorer ───────────────────────────────────────────────────────

export function LocalityExplorer({ stats, loading }: { stats: LocalityStat[] | null; loading: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const byName = new Map((stats || []).map((s) => [s.locality.toLowerCase(), s]));
  // Every known locality, busiest first; ones without listings are shown but inert
  const rows = AHMEDABAD_LOCALITIES.map((name) => ({ name, stat: byName.get(name.toLowerCase()) }))
    .sort((a, b) => (b.stat?.count ?? 0) - (a.stat?.count ?? 0) || a.name.localeCompare(b.name));
  const visible = showAll ? rows : rows.slice(0, 8);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {visible.map(({ name, stat }) =>
          stat ? (
            <Link
              key={name}
              to={`/properties?locality=${encodeURIComponent(name)}`}
              className="card px-4 py-3.5 hover:shadow-card-hover hover:-translate-y-0.5 transition-all group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-navy-800 group-hover:text-navy-900">{name}</span>
                <span className="text-[11px] bg-navy-100 text-navy-700 rounded-full px-2 py-0.5 font-medium">{stat.count}</span>
              </div>
              <p className="text-xs text-navy-500 mt-1.5">From <span className="font-semibold text-navy-700">{formatPriceCompact(stat.minPrice)}</span></p>
              {stat.avgPricePerSqFt > 0 && (
                <p className="text-xs text-navy-400 mt-0.5">≈ ₹{stat.avgPricePerSqFt.toLocaleString('en-IN')} / sq.ft</p>
              )}
            </Link>
          ) : (
            <div key={name} className="card px-4 py-3.5 opacity-60" aria-disabled="true">
              <span className="font-semibold text-navy-700">{name}</span>
              <p className="text-xs text-navy-400 mt-1.5">No listings yet</p>
            </div>
          )
        )}
      </div>
      {rows.length > 8 && (
        <div className="text-center mt-4">
          <button onClick={() => setShowAll((v) => !v)} className="btn-secondary text-xs px-4 py-2">
            {showAll ? 'Show fewer' : `Show all ${rows.length} localities`}
          </button>
        </div>
      )}
    </>
  );
}
