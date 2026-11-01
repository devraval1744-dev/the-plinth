import type { LoanStatus, VisitStatus } from '../../types';

const VISIT: Record<VisitStatus, { label: string; cls: string }> = {
  PENDING:             { label: 'Awaiting builder',   cls: 'bg-amber-100 text-amber-800' },
  CONFIRMED:           { label: 'Confirmed',          cls: 'bg-green-100 text-green-800' },
  RESCHEDULE_PROPOSED: { label: 'New time proposed',  cls: 'bg-indigo-100 text-indigo-800' },
  DECLINED:            { label: 'Declined',           cls: 'bg-red-100 text-red-700' },
  CANCELLED:           { label: 'Cancelled',          cls: 'bg-navy-100 text-navy-600' },
  COMPLETED:           { label: 'Completed',          cls: 'bg-teal-100 text-teal-800' },
};

const LOAN: Record<LoanStatus, { label: string; cls: string }> = {
  SUBMITTED:          { label: 'Awaiting assignment', cls: 'bg-amber-100 text-amber-800' },
  ASSIGNED:           { label: 'DSA assigned',        cls: 'bg-indigo-100 text-indigo-800' },
  IN_PROGRESS:        { label: 'In progress',         cls: 'bg-green-100 text-green-800' },
  DOCUMENTS_REQUIRED: { label: 'Documents needed',    cls: 'bg-orange-100 text-orange-800' },
  COMPLETED:          { label: 'Completed',           cls: 'bg-teal-100 text-teal-800' },
  CLOSED:             { label: 'Closed',              cls: 'bg-navy-100 text-navy-600' },
  CANCELLED:          { label: 'Withdrawn',           cls: 'bg-navy-100 text-navy-600' },
};

export function VisitStatusPill({ status }: { status: VisitStatus }) {
  const s = VISIT[status];
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function LoanStatusPill({ status }: { status: LoanStatus }) {
  const s = LOAN[status];
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export const isVisitOpen = (s: VisitStatus) => s === 'PENDING' || s === 'CONFIRMED' || s === 'RESCHEDULE_PROPOSED';
export const isLoanOpen = (s: LoanStatus) =>
  s === 'SUBMITTED' || s === 'ASSIGNED' || s === 'IN_PROGRESS' || s === 'DOCUMENTS_REQUIRED';
