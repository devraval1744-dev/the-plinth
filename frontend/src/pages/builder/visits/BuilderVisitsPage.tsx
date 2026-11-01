import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../../components/layout/Navbar';
import Modal from '../../../components/ui/Modal';
import AlertMessage from '../../../components/ui/AlertMessage';
import EmptyState, { SectionError } from '../../../components/ui/EmptyState';
import Thumb from '../../../components/ui/Thumb';
import { Skeleton } from '../../../components/ui/Skeleton';
import { VisitStatusPill } from '../../../components/ui/StatusPill';
import { useAsync } from '../../../hooks/useAsync';
import { useToast } from '../../../context/ToastContext';
import { listBuilderVisitsApi, respondToVisitApi } from '../../../api/visits.api';
import { getErrorMessage } from '../../../api/client';
import { formatVisitDate, timeAgo, todayInIndia } from '../../../utils/format';
import { VISIT_SLOTS } from '../../../types';
import type { SiteVisit, VisitAction, VisitSlot } from '../../../types';

const ACTION_COPY: Record<VisitAction, { title: string; confirm: string; blurb: string }> = {
  confirm:    { title: 'Confirm this visit',        confirm: 'Confirm visit',   blurb: 'The customer will be told the visit is confirmed and will see your contact number.' },
  decline:    { title: 'Decline this visit',        confirm: 'Decline',         blurb: "The customer will be notified. Adding a short reason helps them choose another slot." },
  reschedule: { title: 'Propose a different time',  confirm: 'Send proposal',   blurb: 'The customer must accept the new time before the visit is confirmed.' },
  complete:   { title: 'Mark visit as completed',   confirm: 'Mark completed',  blurb: 'Use this once the customer has visited the property.' },
};

function RespondModal({
  visit, action, onClose, onDone,
}: { visit: SiteVisit; action: VisitAction; onClose: () => void; onDone: (v: SiteVisit) => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayInIndia(1));
  const [slot, setSlot] = useState<VisitSlot | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = ACTION_COPY[action];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (action === 'reschedule' && (!date || !slot)) { setError('Choose a new date and time slot'); return; }
    setBusy(true);
    try {
      const updated = await respondToVisitApi(visit._id, {
        action,
        note: note.trim() || undefined,
        newDate: action === 'reschedule' ? date : undefined,
        newSlot: action === 'reschedule' ? (slot as VisitSlot) : undefined,
      });
      toast.success('Visit updated — the customer has been notified');
      onDone(updated);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose(); }}
      title={copy.title}
      subtitle={`${visit.customer?.name ?? visit.contactName} · ${visit.property?.projectName ?? ''}`}
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Back</button>
          <button type="submit" form="respond-form" disabled={busy} className={action === 'decline' ? 'btn-danger' : 'btn-primary'}>
            {busy ? 'Saving…' : copy.confirm}
          </button>
        </div>
      }
    >
      <form id="respond-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-navy-600">{copy.blurb}</p>
        {error && <AlertMessage type="error" message={error} />}

        {action === 'reschedule' && (
          <>
            <div>
              <label htmlFor="rs-date" className="label">New date</label>
              <input id="rs-date" type="date" className="input" min={todayInIndia()} max={todayInIndia(60)} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <fieldset>
              <legend className="label">New time slot</legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {VISIT_SLOTS.map((s) => (
                  <label key={s.value} className={`rounded-lg border px-3 py-2 text-center cursor-pointer text-sm ${slot === s.value ? 'border-navy-700 bg-navy-700 text-cream-100' : 'border-navy-200 hover:border-navy-400'}`}>
                    <input type="radio" name="rs-slot" className="sr-only" checked={slot === s.value} onChange={() => setSlot(s.value)} />
                    <span className="block font-semibold">{s.label}</span>
                    <span className="block text-xs opacity-80">{s.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {action !== 'complete' && (
          <div>
            <label htmlFor="rs-note" className="label">Note to customer <span className="text-navy-400 font-normal">(optional)</span></label>
            <textarea id="rs-note" rows={2} maxLength={500} className="input resize-none" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
      </form>
    </Modal>
  );
}

function VisitRow({ visit, onAction }: { visit: SiteVisit; onAction: (a: VisitAction) => void }) {
  const p = visit.property;
  const isDue = visit.visitDate.slice(0, 10) <= todayInIndia();
  const actions: { a: VisitAction; label: string; cls: string; hidden?: boolean }[] = [];
  if (visit.status === 'PENDING') {
    actions.push({ a: 'confirm', label: 'Confirm', cls: 'btn-primary' }, { a: 'reschedule', label: 'Propose new time', cls: 'btn-secondary' }, { a: 'decline', label: 'Decline', cls: 'btn-secondary' });
  } else if (visit.status === 'CONFIRMED') {
    actions.push({ a: 'complete', label: 'Mark completed', cls: 'btn-primary', hidden: !isDue }, { a: 'reschedule', label: 'Reschedule', cls: 'btn-secondary' }, { a: 'decline', label: 'Cancel visit', cls: 'btn-secondary' });
  }

  return (
    <article className="card px-5 py-5">
      <div className="flex gap-4">
        <Thumb src={p?.coverImageUrl} className="w-16 h-16" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-navy-900">{visit.customer?.name ?? visit.contactName}</p>
              <p className="text-xs text-navy-500 mt-0.5">
                {p ? <>for <span className="font-medium">{p.projectName}</span> · {p.locality}</> : 'Property removed'}
              </p>
            </div>
            <VisitStatusPill status={visit.status} />
          </div>

          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-xs text-navy-400">Date</dt><dd className="font-medium text-navy-800">{formatVisitDate(visit.visitDate)}</dd></div>
            <div><dt className="text-xs text-navy-400">Slot</dt><dd className="font-medium text-navy-800">{visit.timeSlotLabel}</dd></div>
            <div><dt className="text-xs text-navy-400">Visitors</dt><dd className="font-medium text-navy-800">{visit.visitors}</dd></div>
            <div><dt className="text-xs text-navy-400">Contact</dt>
              <dd className="font-medium text-navy-800"><a href={`tel:${visit.contactPhone}`} className="underline">{visit.contactPhone}</a></dd></div>
          </dl>
        </div>
      </div>

      {visit.status === 'RESCHEDULE_PROPOSED' && visit.proposedDate && (
        <p className="mt-3 text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          Waiting for the customer to accept: {formatVisitDate(visit.proposedDate)} · {visit.proposedSlotLabel}
        </p>
      )}
      {visit.notes && <p className="mt-3 text-sm text-navy-600 bg-cream-100 rounded-lg px-3 py-2"><span className="font-medium">Customer note:</span> {visit.notes}</p>}
      {visit.builderNote && <p className="mt-2 text-sm text-navy-500"><span className="font-medium">Your note:</span> {visit.builderNote}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-navy-400">Requested {timeAgo(visit.createdAt)}</p>
        <div className="flex flex-wrap gap-2">
          {actions.filter((x) => !x.hidden).map((x) => (
            <button key={x.a} className={`${x.cls} text-xs px-4 py-2`} onClick={() => onAction(x.a)}>{x.label}</button>
          ))}
        </div>
      </div>
    </article>
  );
}

const TABS = [
  { key: 'pending', label: 'Needs response', match: (v: SiteVisit) => v.status === 'PENDING' },
  { key: 'upcoming', label: 'Upcoming', match: (v: SiteVisit) => v.status === 'CONFIRMED' || v.status === 'RESCHEDULE_PROPOSED' },
  { key: 'history', label: 'History', match: (v: SiteVisit) => ['COMPLETED', 'DECLINED', 'CANCELLED'].includes(v.status) },
] as const;

export default function BuilderVisitsPage() {
  const visits = useAsync(listBuilderVisitsApi, []);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('pending');
  const [active, setActive] = useState<{ visit: SiteVisit; action: VisitAction } | null>(null);

  const all = visits.data ?? [];
  const current = TABS.find((t) => t.key === tab)!;
  const shown = all.filter(current.match);

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />
      <main className="page-container py-8 space-y-6 max-w-4xl pb-12">
        <div>
          <Link to="/builder" className="text-sm text-navy-500 hover:text-navy-800">← Dashboard</Link>
          <h1 className="font-display text-3xl font-semibold text-navy-900 mt-2">Site visit requests</h1>
          <p className="text-navy-500 mt-1">Customers who want to visit your projects. Reply promptly — it improves conversion.</p>
        </div>

        <div className="flex gap-2 border-b border-navy-200 overflow-x-auto" role="tablist">
          {TABS.map((t) => {
            const count = all.filter(t.match).length;
            return (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.key ? 'border-navy-700 text-navy-900' : 'border-transparent text-navy-500 hover:text-navy-800'
                }`}>
                {t.label}
                <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${t.key === 'pending' && count > 0 ? 'bg-gold-500 text-white' : 'text-navy-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {visits.loading ? (
          <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
        ) : visits.error ? (
          <SectionError message={visits.error} onRetry={visits.reload} />
        ) : shown.length === 0 ? (
          <EmptyState icon="📅" title="Nothing here" message={
            tab === 'pending' ? "You're all caught up — new requests will appear here and in your notifications."
            : tab === 'upcoming' ? 'Confirmed visits will be listed here.' : 'Completed and closed visits will be listed here.'} />
        ) : (
          <div className="space-y-4">
            {shown.map((v) => <VisitRow key={v._id} visit={v} onAction={(action) => setActive({ visit: v, action })} />)}
          </div>
        )}
      </main>

      {active && (
        <RespondModal
          visit={active.visit}
          action={active.action}
          onClose={() => setActive(null)}
          onDone={(updated) => visits.setData((prev) => (prev ? prev.map((v) => (v._id === updated._id ? updated : v)) : prev))}
        />
      )}
    </div>
  );
}
