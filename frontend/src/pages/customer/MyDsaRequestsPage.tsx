import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import CustomerMobileNav from '../../components/layout/CustomerMobileNav';
import EmptyState, { SectionError } from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ConnectDsaModal from '../../components/dsa/ConnectDsaModal';
import Thumb from '../../components/ui/Thumb';
import { Skeleton } from '../../components/ui/Skeleton';
import { LoanStatusPill, isLoanOpen } from '../../components/ui/StatusPill';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../context/ToastContext';
import { cancelLoanApi, listMyLoansApi } from '../../api/loans.api';
import { timeAgo } from '../../utils/format';
import type { LoanRequest, LoanStatus } from '../../types';

const STEPS: { key: LoanStatus; label: string }[] = [
  { key: 'SUBMITTED', label: 'Sent' },
  { key: 'ASSIGNED', label: 'DSA assigned' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'COMPLETED', label: 'Completed' },
];

/** 0-based index of the furthest step reached (DOCUMENTS_REQUIRED sits in the "in progress" step). */
function stepIndex(status: LoanStatus): number {
  switch (status) {
    case 'SUBMITTED': return 0;
    case 'ASSIGNED': return 1;
    case 'IN_PROGRESS':
    case 'DOCUMENTS_REQUIRED': return 2;
    default: return 3;
  }
}

function Timeline({ status }: { status: LoanStatus }) {
  if (status === 'CANCELLED' || status === 'CLOSED') return null;
  const current = stepIndex(status);
  return (
    <ol className="flex items-center gap-1 mt-4" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex-1 min-w-0">
          <div className={`h-1.5 rounded-full ${i <= current ? 'bg-navy-700' : 'bg-navy-100'}`} />
          <p className={`text-[11px] mt-1.5 truncate ${i === current ? 'font-semibold text-navy-800' : 'text-navy-400'}`}>{s.label}</p>
        </li>
      ))}
    </ol>
  );
}

function RequestCard({ request, onWithdraw }: { request: LoanRequest; onWithdraw: () => void }) {
  const p = request.property;
  return (
    <article className={`card px-5 py-5 ${request.status === 'DOCUMENTS_REQUIRED' ? 'border-orange-300' : ''}`}>
      <div className="flex gap-4">
        <Thumb src={p?.coverImageUrl} className="w-16 h-16" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold text-navy-900">
                {p ? p.projectName : 'General DSA enquiry'}
              </p>
              <p className="text-xs text-navy-500 mt-0.5">
                {p ? <><Link to={`/properties/${p._id}`} className="underline">View property</Link> · {p.locality}</> : 'Not tied to a specific property'}
              </p>
            </div>
            <LoanStatusPill status={request.status} />
          </div>
          <p className="text-xs text-navy-400 mt-2">Requested {timeAgo(request.createdAt)}</p>
        </div>
      </div>

      <Timeline status={request.status} />

      {request.status === 'DOCUMENTS_REQUIRED' && (
        <div className="mt-4 rounded-xl bg-orange-50 border border-orange-200 px-4 py-3">
          <p className="text-sm font-semibold text-orange-900">Action needed</p>
          <p className="text-sm text-orange-800 mt-0.5">Your DSA partner needs some documents to proceed — please get in touch with them.</p>
        </div>
      )}

      {request.dsaNote && (
        <p className="mt-3 text-sm text-navy-600 bg-cream-100 rounded-lg px-3 py-2">
          <span className="font-medium">Note from your DSA:</span> {request.dsaNote}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {request.dsa ? (
          <p className="text-sm text-navy-600">
            Your DSA partner: <span className="font-medium">{request.dsa.name}</span>
            {request.dsa.phone && <> · <a href={`tel:${request.dsa.phone}`} className="text-navy-800 underline">{request.dsa.phone}</a></>}
          </p>
        ) : isLoanOpen(request.status) ? (
          <p className="text-sm text-navy-500">We'll assign a verified DSA partner shortly.</p>
        ) : <span />}
        {isLoanOpen(request.status) && (
          <button className="btn-secondary text-xs px-4 py-2" onClick={onWithdraw}>Withdraw request</button>
        )}
      </div>
    </article>
  );
}

export default function MyDsaRequestsPage() {
  const requests = useAsync(listMyLoansApi, []);
  const toast = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState<LoanRequest | null>(null);

  const list = requests.data ?? [];
  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />
      <main className="page-container py-8 space-y-6 pb-28 sm:pb-12 max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">DSA connections</h1>
            <p className="text-navy-500 mt-1">Track the verified DSA partners helping you with financing.</p>
          </div>
          <button className="btn-primary" onClick={() => setNewOpen(true)}>Connect with a DSA</button>
        </div>

        {requests.loading ? (
          <div className="space-y-4"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
        ) : requests.error ? (
          <SectionError message={requests.error} onRetry={requests.reload} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="🤝"
            title="No DSA connections yet"
            message="Tap “Connect with a DSA” on any property page, or start here — a verified partner will reach out and handle the rest."
            action={<button className="btn-primary" onClick={() => setNewOpen(true)}>Connect with a DSA</button>}
          />
        ) : (
          <div className="space-y-4">
            {list.map((r) => <RequestCard key={r._id} request={r} onWithdraw={() => setWithdrawing(r)} />)}
          </div>
        )}
      </main>

      <ConnectDsaModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => requests.reload()} />
      <ConfirmDialog
        open={Boolean(withdrawing)}
        onClose={() => setWithdrawing(null)}
        title="Withdraw this request?"
        message="Your DSA partner will be told you no longer need help. You can connect again any time."
        confirmLabel="Withdraw request"
        danger
        onConfirm={async () => {
          if (!withdrawing) return;
          const updated = await cancelLoanApi(withdrawing._id);
          requests.setData((prev) => (prev ? prev.map((l) => (l._id === updated._id ? updated : l)) : prev));
          toast.success('Request withdrawn');
        }}
      />
      <CustomerMobileNav />
    </div>
  );
}
