import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import CustomerMobileNav from '../../components/layout/CustomerMobileNav';
import EmptyState, { SectionError } from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Thumb from '../../components/ui/Thumb';
import { Skeleton } from '../../components/ui/Skeleton';
import { VisitStatusPill, isVisitOpen } from '../../components/ui/StatusPill';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../context/ToastContext';
import { acceptRescheduleApi, cancelVisitApi, listMyVisitsApi } from '../../api/visits.api';
import { getErrorMessage } from '../../api/client';
import { formatVisitDate, timeAgo } from '../../utils/format';
import type { SiteVisit } from '../../types';

function VisitCard({
  visit, onAccept, onCancel, busy,
}: { visit: SiteVisit; onAccept: () => void; onCancel: () => void; busy: boolean }) {
  const p = visit.property;
  const open = isVisitOpen(visit.status);
  return (
    <article className={`card px-5 py-5 ${visit.status === 'RESCHEDULE_PROPOSED' ? 'border-indigo-300' : ''}`}>
      <div className="flex gap-4">
        <Thumb src={p?.coverImageUrl} className="w-20 h-20 sm:w-24 sm:h-24" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {p ? (
                <Link to={`/properties/${p._id}`} className="font-display font-semibold text-navy-900 hover:underline truncate block">
                  {p.projectName}
                </Link>
              ) : <span className="font-semibold text-navy-700">Property no longer available</span>}
              {p && <p className="text-xs text-navy-500 mt-0.5">📍 {p.locality}, {p.city}</p>}
            </div>
            <VisitStatusPill status={visit.status} />
          </div>

          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-navy-400">Date</dt>
              <dd className={`font-medium text-navy-800 ${visit.status === 'RESCHEDULE_PROPOSED' ? 'line-through opacity-60' : ''}`}>{formatVisitDate(visit.visitDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-navy-400">Time</dt>
              <dd className={`font-medium text-navy-800 ${visit.status === 'RESCHEDULE_PROPOSED' ? 'line-through opacity-60' : ''}`}>{visit.timeSlotLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-navy-400">Visitors</dt>
              <dd className="font-medium text-navy-800">{visit.visitors}</dd>
            </div>
          </dl>
        </div>
      </div>

      {visit.status === 'RESCHEDULE_PROPOSED' && visit.proposedDate && (
        <div className="mt-4 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3">
          <p className="text-sm font-semibold text-indigo-900">The builder suggested a new time</p>
          <p className="text-sm text-indigo-800 mt-0.5">{formatVisitDate(visit.proposedDate)} · {visit.proposedSlotLabel}</p>
        </div>
      )}

      {visit.builderNote && (
        <p className="mt-3 text-sm text-navy-600 bg-cream-100 rounded-lg px-3 py-2">
          <span className="font-medium">Builder's note:</span> {visit.builderNote}
        </p>
      )}

      {visit.status === 'CONFIRMED' && visit.builder && (
        <p className="mt-3 text-sm text-navy-600">
          Host: <span className="font-medium">{visit.builder.name}</span>
          {visit.builder.phone && <> · <a href={`tel:${visit.builder.phone}`} className="text-navy-800 underline">{visit.builder.phone}</a></>}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-navy-400">Requested {timeAgo(visit.createdAt)}</p>
        {open && (
          <div className="flex gap-2">
            {visit.status === 'RESCHEDULE_PROPOSED' && (
              <button className="btn-primary text-xs px-4 py-2" disabled={busy} onClick={onAccept}>Accept new time</button>
            )}
            <button className="btn-secondary text-xs px-4 py-2" disabled={busy} onClick={onCancel}>
              {visit.status === 'RESCHEDULE_PROPOSED' ? 'Decline & cancel' : 'Cancel visit'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export default function MyVisitsPage() {
  const visits = useAsync(listMyVisitsApi, []);
  const toast = useToast();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [cancelling, setCancelling] = useState<SiteVisit | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const replace = (updated: SiteVisit) =>
    visits.setData((prev) => (prev ? prev.map((v) => (v._id === updated._id ? updated : v)) : prev));

  const accept = async (v: SiteVisit) => {
    setBusyId(v._id);
    try {
      replace(await acceptRescheduleApi(v._id));
      toast.success('New time confirmed');
    } catch (e) {
      toast.error(getErrorMessage(e));
      visits.reload();
    } finally {
      setBusyId(null);
    }
  };

  const all = visits.data ?? [];
  const upcoming = all.filter((v) => isVisitOpen(v.status));
  const past = all.filter((v) => !isVisitOpen(v.status));
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />
      <main className="page-container py-8 space-y-6 pb-28 sm:pb-12 max-w-4xl">
        <div>
          <h1 className="font-display text-3xl font-semibold text-navy-900">My site visits</h1>
          <p className="text-navy-500 mt-1">Track your requests and see the builder's replies.</p>
        </div>

        <div className="flex gap-2 border-b border-navy-200" role="tablist">
          {([['upcoming', 'Upcoming', upcoming.length], ['past', 'Past', past.length]] as const).map(([key, label, count]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
                tab === key ? 'border-navy-700 text-navy-900' : 'border-transparent text-navy-500 hover:text-navy-800'
              }`}
            >
              {label} <span className="ml-1 text-xs text-navy-400">{count}</span>
            </button>
          ))}
        </div>

        {visits.loading ? (
          <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
        ) : visits.error ? (
          <SectionError message={visits.error} onRetry={visits.reload} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={tab === 'upcoming' ? '📅' : '🗂️'}
            title={tab === 'upcoming' ? 'No upcoming visits' : 'No past visits yet'}
            message={tab === 'upcoming'
              ? 'Open any property and choose “Request Site Visit” to see it in person.'
              : 'Completed, cancelled and declined visits will show up here.'}
            action={tab === 'upcoming' ? <Link to="/properties" className="btn-primary">Find a property</Link> : undefined}
          />
        ) : (
          <div className="space-y-4">
            {shown.map((v) => (
              <VisitCard key={v._id} visit={v} busy={busyId === v._id}
                onAccept={() => accept(v)} onCancel={() => setCancelling(v)} />
            ))}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title="Cancel this visit?"
        message={`Your visit to ${cancelling?.property?.projectName ?? 'this property'} on ${cancelling ? formatVisitDate(cancelling.visitDate) : ''} will be cancelled and the builder will be notified. You can always request another slot.`}
        confirmLabel="Yes, cancel visit"
        danger
        onConfirm={async () => { if (cancelling) replace(await cancelVisitApi(cancelling._id)); toast.success('Visit cancelled'); }}
      />
      <CustomerMobileNav />
    </div>
  );
}
