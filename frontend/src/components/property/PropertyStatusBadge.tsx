import type { PropertyStatus } from '../../types';

const CONFIG: Record<PropertyStatus, { label: string; cls: string }> = {
  DRAFT:             { label: 'Draft',             cls: 'badge bg-navy-100 text-navy-600' },
  SUBMITTED:         { label: 'Under Review',      cls: 'badge bg-blue-100 text-blue-700' },
  APPROVED:          { label: 'Approved',           cls: 'badge-success' },
  REJECTED:          { label: 'Rejected',           cls: 'badge-danger' },
  CHANGES_REQUESTED: { label: 'Changes Requested',  cls: 'badge-warning' },
};

export default function PropertyStatusBadge({ status }: { status: PropertyStatus }) {
  const { label, cls } = CONFIG[status] ?? CONFIG.DRAFT;
  return <span className={cls}>{label}</span>;
}
