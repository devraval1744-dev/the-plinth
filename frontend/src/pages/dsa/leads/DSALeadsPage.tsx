import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../../components/layout/Navbar';
import Modal from '../../../components/ui/Modal';
import AlertMessage from '../../../components/ui/AlertMessage';
import EmptyState, { SectionError } from '../../../components/ui/EmptyState';
import Thumb from '../../../components/ui/Thumb';
import { Skeleton } from '../../../components/ui/Skeleton';
import { LoanStatusPill, isLoanOpen } from '../../../components/ui/StatusPill';
import { useAsync } from '../../../hooks/useAsync';
import { useToast } from '../../../context/ToastContext';
import { listLeadsApi, updateLeadStatusApi } from '../../../api/loans.api';
import { getErrorMessage } from '../../../api/client';
import { formatDate, formatPriceCompact, timeAgo } from '../../../utils/format';
import type { DsaLeadStatus, LoanRequest } from '../../../types';

const STATUS_COPY: Record<DsaLeadStatus, { title: string; confirm: string; blurb: string; danger?: boolean }> = {
  IN_PROGRESS:        { title: 'Start working on this lead', confirm: 'Mark in progress', blurb: 'The customer will be told you have started on their request.' },
  DOCUMENTS_REQUIRED: { title: 'Request documents',          confirm: 'Request documents', blurb: 'The customer will be asked to get in touch with the documents you need. Say which ones in the note.' },
  COMPLETED:          { title: 'Mark as completed',          confirm: 'Mark completed',    blurb: 'Use this once your assistance on this loan is finished. This is final.' },
  CLOSED:             { title: 'Close this lead',            confirm: 'Close lead',        blurb: 'Use this if the customer is not proceeding. This is final.', danger: true },
};

function StatusModal({
  lead, status, onClose, onDone,
}: { lead: LoanRequest; status: DsaLeadStatus; onClose: () => void; onDone: (l: LoanRequest) => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = STATUS_COPY[status];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await updateLeadStatusApi(lead._id, status, note.trim() || undefined);
      toast.success('Lead updated — the customer has been notified');
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
      subtitle={lead.customer?.name ?? lead.contactName}
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Back</button>
          <button type="submit" form="status-form" disabled={busy} className={copy.danger ? 'btn-danger' : 'btn-primary'}>
            {busy ? 'Saving…' : copy.confirm}
          </button>
        </div>
      }
    >
      <form id="status-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-navy-600">{copy.blurb}</p>
        {error && <AlertMessage type="error" message={error} />}
        <div>
          <label htmlFor="lead-note" className="label">Note to customer <span className="text-navy-400 font-normal">(optional)</span></label>
          <textarea id="lead-note" rows={3} maxLength={500} className="input resize-none" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Please don't promise approval, rates or amounts" />
        </div>
      </form>
    </Modal>
  );
}

function LeadCard({ lead, onStatus }: { lead: LoanRequest; onStatus: (s: DsaLeadStatus) => void }) {
  const p = lead.property;
  const actions: { s: DsaLeadStatus; label: string; cls: string }[] = [];
  if (lead.status === 'ASSIGNED') actions.push({ s: 'IN_PROGRESS', label: 'Start working', cls: 'btn-primary' });
  if (lead.status === 'DOCUMENTS_REQUIRED') actions.push({ s: 'IN_PROGRESS', label: 'Documents received', cls: 'btn-primary' });
  if (lead.status === 'IN_PROGRESS') actions.push({ s: 'DOCUMENTS_REQUIRED', label: 'Request documents', cls: 'btn-secondary' });
  if (isLoanOpen(lead.status)) {
    actions.push({ s: 'COMPLETED', label: 'Mark completed', cls: lead.status === 'ASSIGNED' ? 'btn-secondary' : 'btn-primary' });
    actions.push({ s: 'CLOSED', label: 'Close', cls: 'btn-secondary' });
  }

  return (
    <article className="card px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-navy-900">{lead.customer?.name ?? lead.contactName}</p>
          <p className="text-sm text-navy-600 mt-0.5">
            <a href={`tel:${lead.contactPhone}`} className="underline">{lead.contactPhone}</a>
            {lead.customer?.email && <> · <a href={`mailto:${lead.customer.email}`} className="underline">{lead.customer.email}</a></>}
          </p>
        </div>
        <LoanStatusPill status={lead.status} />
      </div>

      {p && (
        <div className="flex items-center gap-3 mt-4 rounded-xl bg-cream-100 px-3 py-2.5">
          <Thumb src={p.coverImageUrl} className="w-12 h-12" />
          <p className="text-sm text-navy-700 min-w-0">
            Interested in <span className="font-semibold">{p.projectName}</span> · {p.locality}
            <span className="block text-xs text-navy-500">{formatPriceCompact(p.minPrice)} – {formatPriceCompact(p.maxPrice)}</span>
          </p>
        </div>
      )}

      <p className="mt-4 text-sm text-navy-600">
        <span className="text-xs text-navy-400">Consent to be contacted given on</span>{' '}
        <span className="font-medium text-navy-800">{formatDate(lead.consentAt)}</span>
      </p>

      {lead.notes && <p className="mt-3 text-sm text-navy-600 bg-cream-100 rounded-lg px-3 py-2"><span className="font-medium">Customer note:</span> {lead.notes}</p>}
      {lead.dsaNote && <p className="mt-2 text-sm text-navy-500"><span className="font-medium">Your note:</span> {lead.dsaNote}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-navy-400">Received {timeAgo(lead.createdAt)}</p>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <button key={a.s + a.label} className={`${a.cls} text-xs px-4 py-2`} onClick={() => onStatus(a.s)}>{a.label}</button>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function DSALeadsPage() {
  const leads = useAsync(listLeadsApi, []);
  const [tab, setTab] = useState<'active' | 'closed'>('active');
  const [active, setActive] = useState<{ lead: LoanRequest; status: DsaLeadStatus } | null>(null);

  const all = leads.data ?? [];
  const open = all.filter((l) => isLoanOpen(l.status));
  const closed = all.filter((l) => !isLoanOpen(l.status));
  const shown = tab === 'active' ? open : closed;

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />
      <main className="page-container py-8 space-y-6 max-w-4xl pb-12">
        <div>
          <Link to="/dsa" className="text-sm text-navy-500 hover:text-navy-800">← Dashboard</Link>
          <h1 className="font-display text-3xl font-semibold text-navy-900 mt-2">Loan leads</h1>
          <p className="text-navy-500 mt-1">Customers who asked to be connected with a DSA and consented to be contacted.</p>
        </div>

        <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          Do not guarantee approval, interest rates, loan amounts or eligibility outcomes. Use these details only to assist
          this customer.
        </div>

        <div className="flex gap-2 border-b border-navy-200" role="tablist">
          {([['active', 'Active', open.length], ['closed', 'Closed', closed.length]] as const).map(([key, label, count]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
                tab === key ? 'border-navy-700 text-navy-900' : 'border-transparent text-navy-500 hover:text-navy-800'
              }`}>
              {label} <span className="ml-1 text-xs text-navy-400">{count}</span>
            </button>
          ))}
        </div>

        {leads.loading ? (
          <div className="space-y-4"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
        ) : leads.error ? (
          <SectionError message={leads.error} onRetry={leads.reload} />
        ) : shown.length === 0 ? (
          <EmptyState icon="📋" title={tab === 'active' ? 'No active leads' : 'No closed leads'}
            message={tab === 'active' ? 'New leads are assigned to you automatically and will appear here.' : 'Completed and closed leads will be listed here.'} />
        ) : (
          <div className="space-y-4">
            {shown.map((l) => <LeadCard key={l._id} lead={l} onStatus={(status) => setActive({ lead: l, status })} />)}
          </div>
        )}
      </main>

      {active && (
        <StatusModal
          lead={active.lead}
          status={active.status}
          onClose={() => setActive(null)}
          onDone={(updated) => leads.setData((prev) => (prev ? prev.map((l) => (l._id === updated._id ? updated : l)) : prev))}
        />
      )}
    </div>
  );
}
