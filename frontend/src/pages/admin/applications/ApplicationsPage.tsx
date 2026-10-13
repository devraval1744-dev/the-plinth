import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../../components/layout/Navbar';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import AlertMessage from '../../../components/ui/AlertMessage';
import {
  listBuilderApplicationsApi,
  listDSAApplicationsApi,
  reviewBuilderApplicationApi,
  reviewDSAApplicationApi,
} from '../../../api/applications.api';
import { getErrorMessage } from '../../../api/client';
import type {
  BuilderApplication,
  DSAApplication,
  ApplicationStatus,
  ReviewActionPayload,
} from '../../../types';

// ─── Status badge helper ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const map: Record<ApplicationStatus, string> = {
    PENDING: 'badge bg-amber-100 text-amber-800',
    APPROVED: 'badge-success',
    REJECTED: 'badge-danger',
    CLARIFICATION_REQUESTED: 'badge bg-blue-100 text-blue-800',
  };
  const labels: Record<ApplicationStatus, string> = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    CLARIFICATION_REQUESTED: 'Clarification',
  };
  return <span className={map[status]}>{labels[status]}</span>;
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type AppType = 'builder' | 'dsa';
type StatusFilter = 'ALL' | ApplicationStatus;

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Clarification', value: 'CLARIFICATION_REQUESTED' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
];

// ─── Review Modal ─────────────────────────────────────────────────────────────

interface ReviewModalProps {
  application: BuilderApplication | DSAApplication;
  appType: AppType;
  onClose: () => void;
  onSuccess: (updatedApp: BuilderApplication | DSAApplication, tempPassword?: string) => void;
}

function ReviewModal({ application, appType, onClose, onSuccess }: ReviewModalProps) {
  const [action, setAction] = useState<ReviewActionPayload['action'] | ''>('');
  const [adminNotes, setAdminNotes] = useState('');
  const [clarificationMessage, setClarificationMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isBuilder = appType === 'builder';
  const app = application as BuilderApplication & DSAApplication;

  const handleReview = async () => {
    if (!action) return;
    setError('');
    setIsLoading(true);
    try {
      const payload: ReviewActionPayload = {
        action,
        ...(adminNotes.trim() ? { adminNotes: adminNotes.trim() } : {}),
        ...(action === 'request_clarification' && clarificationMessage.trim()
          ? { clarificationMessage: clarificationMessage.trim() }
          : {}),
      };
      const result = isBuilder
        ? await reviewBuilderApplicationApi(application._id, payload)
        : await reviewDSAApplicationApi(application._id, payload);

      onSuccess(result.application as BuilderApplication | DSAApplication, result.temporaryPassword);
    } catch (err) {
      setError(getErrorMessage(err));
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-card-hover w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-navy-100">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="font-display text-xl font-semibold text-navy-900">
                {isBuilder ? 'Builder' : 'DSA'} Application
              </h2>
              <StatusBadge status={application.status} />
            </div>
            <p className="text-sm text-navy-500">{app.applicantName} — {application.email}</p>
          </div>
          <button
            onClick={onClose}
            className="text-navy-400 hover:text-navy-700 text-xl leading-none p-1 ml-4"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Applicant details */}
          <section>
            <h3 className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-3">
              Applicant Details
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DetailRow label="Name" value={app.applicantName} />
              <DetailRow label="Email" value={application.email} />
              <DetailRow label="Phone" value={application.phone} />
              <DetailRow
                label="Submitted"
                value={new Date(application.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              />
            </div>
          </section>

          {/* Role-specific details */}
          <section>
            <h3 className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-3">
              {isBuilder ? 'Company Details' : 'Professional Details'}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {isBuilder ? (
                <>
                  <DetailRow label="Company" value={(app as BuilderApplication).companyName} />
                  <DetailRow label="Business Type" value={(app as BuilderApplication).businessType} />
                  <DetailRow label="Experience" value={`${app.yearsOfExperience} years`} />
                  <DetailRow label="Projects" value={`${(app as BuilderApplication).numberOfProjects} completed`} />
                  {(app as BuilderApplication).reraRegistrationNumber && (
                    <DetailRow label="RERA No." value={(app as BuilderApplication).reraRegistrationNumber!} />
                  )}
                  <DetailRow label="City" value={`${(app as BuilderApplication).city}, ${(app as BuilderApplication).state}`} />
                  {(app as BuilderApplication).website && (
                    <DetailRow label="Website" value={(app as BuilderApplication).website!} />
                  )}
                </>
              ) : (
                <>
                  <DetailRow label="Employment" value={(app as DSAApplication).employmentType} />
                  {(app as DSAApplication).firmName && (
                    <DetailRow label="Firm" value={(app as DSAApplication).firmName!} />
                  )}
                  <DetailRow label="Experience" value={`${app.yearsOfExperience} years`} />
                  {(app as DSAApplication).currentOrganization && (
                    <DetailRow label="Organisation" value={(app as DSAApplication).currentOrganization!} />
                  )}
                  {(app as DSAApplication).bankPartnerships && (
                    <DetailRow label="Bank Partners" value={(app as DSAApplication).bankPartnerships!} />
                  )}
                  <DetailRow label="City" value={`${(app as DSAApplication).city}, ${(app as DSAApplication).state}`} />
                  {(app as DSAApplication).areasOfOperation?.length > 0 && (
                    <DetailRow
                      label="Areas"
                      value={(app as DSAApplication).areasOfOperation.join(', ')}
                    />
                  )}
                </>
              )}
            </div>
          </section>

          {/* Description */}
          <section>
            <h3 className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">
              Description
            </h3>
            <p className="text-sm text-navy-700 leading-relaxed bg-cream-100 rounded-lg px-4 py-3">
              {application.description}
            </p>
          </section>

          {/* Prior clarification */}
          {application.clarificationMessage && (
            <section className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">Clarification previously requested:</p>
              <p className="text-sm text-blue-800">{application.clarificationMessage}</p>
            </section>
          )}

          {/* Prior admin notes */}
          {application.adminNotes && (
            <section className="bg-navy-50 border border-navy-200 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-navy-600 mb-1">Admin notes:</p>
              <p className="text-sm text-navy-700">{application.adminNotes}</p>
            </section>
          )}

          {/* Action section — only if not already approved/rejected */}
          {application.status !== 'APPROVED' && application.status !== 'REJECTED' && (
            <section className="border-t border-navy-100 pt-5 space-y-4">
              <h3 className="text-xs font-semibold text-navy-500 uppercase tracking-wide">
                Review Action
              </h3>

              {error && <AlertMessage type="error" message={error} />}

              {/* Action selector */}
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'approve', label: '✓ Approve', cls: 'border-green-300 bg-green-50 text-green-800' },
                  { value: 'reject', label: '✕ Reject', cls: 'border-red-300 bg-red-50 text-red-800' },
                  { value: 'request_clarification', label: '? Request Clarification', cls: 'border-blue-300 bg-blue-50 text-blue-800' },
                ].map(({ value, label, cls }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAction(value as ReviewActionPayload['action'])}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      action === value
                        ? `${cls} ring-2 ring-offset-1 ring-current`
                        : 'border-navy-200 text-navy-600 hover:border-navy-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Notes field */}
              {action && (
                <div className="space-y-3">
                  <div>
                    <label className="label">
                      Admin notes <span className="text-navy-400 font-normal">(internal)</span>
                    </label>
                    <textarea
                      rows={2}
                      className="input resize-none"
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Optional internal notes for this decision…"
                    />
                  </div>

                  {action === 'request_clarification' && (
                    <div>
                      <label className="label">
                        Clarification message *{' '}
                        <span className="text-navy-400 font-normal">(sent to applicant)</span>
                      </label>
                      <textarea
                        rows={3}
                        className="input resize-none"
                        value={clarificationMessage}
                        onChange={(e) => setClarificationMessage(e.target.value)}
                        placeholder="Describe what additional information or clarification is required from the applicant…"
                      />
                    </div>
                  )}

                  {/* Confirmation */}
                  {!confirmOpen ? (
                    <button
                      type="button"
                      disabled={
                        !action ||
                        (action === 'request_clarification' && !clarificationMessage.trim())
                      }
                      onClick={() => setConfirmOpen(true)}
                      className={`btn btn-lg w-full ${
                        action === 'approve'
                          ? 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-400'
                          : action === 'reject'
                          ? 'btn-danger'
                          : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400'
                      }`}
                    >
                      {action === 'approve'
                        ? 'Approve Application'
                        : action === 'reject'
                        ? 'Reject Application'
                        : 'Send Clarification Request'}
                    </button>
                  ) : (
                    <div className="bg-cream-100 rounded-lg px-4 py-4 space-y-3">
                      <p className="text-sm font-medium text-navy-800">
                        Confirm: {action === 'approve' ? 'Approve' : action === 'reject' ? 'Reject' : 'Request clarification for'} this application?
                      </p>
                      {action === 'approve' && (
                        <p className="text-xs text-navy-600">
                          This will create an active {isBuilder ? 'Builder' : 'DSA'} account. A temporary password will be generated.
                        </p>
                      )}
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={handleReview}
                          disabled={isLoading}
                          className={`btn flex-1 ${
                            action === 'approve'
                              ? 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-400'
                              : action === 'reject'
                              ? 'btn-danger'
                              : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400'
                          }`}
                        >
                          {isLoading ? <LoadingSpinner size="sm" /> : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmOpen(false)}
                          disabled={isLoading}
                          className="btn btn-secondary flex-1"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Already decided notice */}
          {(application.status === 'APPROVED' || application.status === 'REJECTED') && (
            <div className={`rounded-lg px-4 py-3 text-sm ${
              application.status === 'APPROVED'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              This application has been{' '}
              <strong>{application.status === 'APPROVED' ? 'approved' : 'rejected'}</strong>
              {application.reviewedAt &&
                ` on ${new Date(application.reviewedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
              .
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-navy-500 block">{label}</span>
      <span className="text-navy-800 font-medium">{value}</span>
    </div>
  );
}

// ─── Approval result modal ────────────────────────────────────────────────────

function ApprovalResultModal({
  appType,
  applicantName,
  email,
  temporaryPassword,
  onClose,
}: {
  appType: AppType;
  applicantName: string;
  email: string;
  temporaryPassword: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyPassword = async () => {
    await navigator.clipboard.writeText(temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-card-hover w-full max-w-md">
        <div className="px-6 py-6 text-center space-y-4">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto text-2xl">✓</div>
          <h2 className="font-display text-xl font-semibold text-navy-900">
            {appType === 'builder' ? 'Builder' : 'DSA'} Account Created
          </h2>
          <p className="text-sm text-navy-600">
            An account has been activated for <strong>{applicantName}</strong> ({email}).
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 text-left space-y-3">
            <p className="text-xs font-semibold text-amber-800">
              ⚠ Temporary Password — Share Securely
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border border-amber-300 rounded px-3 py-2 text-sm font-mono text-navy-800 break-all">
                {temporaryPassword}
              </code>
              <button
                onClick={copyPassword}
                className="btn btn-secondary text-xs px-3 py-2 whitespace-nowrap"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-amber-700">
              Share this password with the applicant via a secure channel (phone, encrypted email).
              Email notifications will be added in a future update.
              <span className="block mt-1 font-semibold text-amber-900">
                {appType === 'builder' ? 'Builder' : 'DSA'} must change this temporary password on first login.
              </span>
            </p>
          </div>

          <button onClick={onClose} className="btn-primary btn w-full mt-2">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Application row ──────────────────────────────────────────────────────────

function AppRow({
  app,
  appType,
  onClick,
}: {
  app: BuilderApplication | DSAApplication;
  appType: AppType;
  onClick: () => void;
}) {
  const isBuilder = appType === 'builder';
  const typed = app as BuilderApplication & DSAApplication;

  return (
    <tr
      onClick={onClick}
      className="hover:bg-cream-100 cursor-pointer transition-colors"
    >
      <td className="px-5 py-4">
        <div className="font-medium text-navy-800 text-sm">{typed.applicantName}</div>
        <div className="text-xs text-navy-500">{app.email}</div>
      </td>
      <td className="px-5 py-4 text-sm text-navy-700">
        {isBuilder ? (app as BuilderApplication).companyName : ((app as DSAApplication).firmName || '—')}
      </td>
      <td className="px-5 py-4 text-sm text-navy-600">
        {isBuilder ? (app as BuilderApplication).city : (app as DSAApplication).city}
      </td>
      <td className="px-5 py-4">
        <StatusBadge status={app.status} />
      </td>
      <td className="px-5 py-4 text-xs text-navy-500">
        {new Date(app.createdAt).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
        })}
      </td>
      <td className="px-5 py-4">
        <span className="text-navy-500 text-sm hover:text-navy-800 transition-colors">Review →</span>
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AppType>('builder');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const [builderApps, setBuilderApps] = useState<BuilderApplication[]>([]);
  const [dsaApps, setDsaApps] = useState<DSAApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [selectedApp, setSelectedApp] = useState<BuilderApplication | DSAApplication | null>(null);
  const [approvalResult, setApprovalResult] = useState<{
    appType: AppType;
    applicantName: string;
    email: string;
    temporaryPassword: string;
  } | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setFetchError('');
    try {
      const [builders, dsas] = await Promise.all([
        listBuilderApplicationsApi(),
        listDSAApplicationsApi(),
      ]);
      setBuilderApps(builders);
      setDsaApps(dsas);
    } catch (err) {
      setFetchError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const displayedApps: (BuilderApplication | DSAApplication)[] = (
    activeTab === 'builder' ? builderApps : dsaApps
  ).filter((a) => statusFilter === 'ALL' || a.status === statusFilter);

  const handleReviewSuccess = (
    updated: BuilderApplication | DSAApplication,
    tempPassword?: string
  ) => {
    // Update local state
    if (activeTab === 'builder') {
      setBuilderApps((prev) => prev.map((a) => (a._id === updated._id ? (updated as BuilderApplication) : a)));
    } else {
      setDsaApps((prev) => prev.map((a) => (a._id === updated._id ? (updated as DSAApplication) : a)));
    }
    setSelectedApp(null);

    if (tempPassword) {
      const typed = updated as BuilderApplication & DSAApplication;
      setApprovalResult({
        appType: activeTab,
        applicantName: typed.applicantName,
        email: updated.email,
        temporaryPassword: tempPassword,
      });
    }
  };

  const builderPending = builderApps.filter((a) => a.status === 'PENDING').length;
  const dsaPending = dsaApps.filter((a) => a.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />

      <main className="page-container py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin')}
              className="text-navy-500 hover:text-navy-800 text-sm transition-colors"
            >
              ← Dashboard
            </button>
            <div>
              <h1 className="font-display text-2xl font-semibold text-navy-900">
                Partner Applications
              </h1>
              <p className="text-navy-500 text-sm mt-0.5">
                Review Builder and DSA onboarding applications
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchAll()}
            disabled={isLoading}
            className="btn btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
            title="Refresh applications list"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {fetchError && <AlertMessage type="error" message={fetchError} />}

        {/* Tab bar + status filter */}
        <div className="card px-1 py-1 flex flex-col sm:flex-row gap-2">
          {/* Type tabs */}
          <div className="flex flex-1 rounded-lg overflow-hidden">
            <button
              onClick={() => setActiveTab('builder')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'builder'
                  ? 'bg-navy-700 text-cream-100'
                  : 'text-navy-600 hover:bg-navy-50'
              }`}
            >
              🏗️ Builders
              {builderPending > 0 && (
                <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {builderPending}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('dsa')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'dsa'
                  ? 'bg-navy-700 text-cream-100'
                  : 'text-navy-600 hover:bg-navy-50'
              }`}
            >
              🤝 DSA Partners
              {dsaPending > 0 && (
                <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {dsaPending}
                </span>
              )}
            </button>
          </div>

          {/* Status filter */}
          <div className="flex flex-wrap gap-1 sm:justify-end">
            {STATUS_FILTERS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === value
                    ? 'bg-navy-800 text-cream-100'
                    : 'text-navy-500 hover:bg-navy-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <LoadingSpinner size="lg" />
            </div>
          ) : displayedApps.length === 0 ? (
            <div className="text-center py-16 text-navy-500">
              <div className="text-4xl mb-3">{activeTab === 'builder' ? '🏗️' : '🤝'}</div>
              <p className="font-medium text-navy-700">No applications found</p>
              <p className="text-sm mt-1">
                {statusFilter !== 'ALL'
                  ? `No ${statusFilter.toLowerCase().replace('_', ' ')} applications for ${activeTab === 'builder' ? 'builders' : 'DSA partners'}.`
                  : `No ${activeTab === 'builder' ? 'builder' : 'DSA'} applications yet.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-100 bg-cream-100">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-navy-600 uppercase tracking-wide">
                      Applicant
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-navy-600 uppercase tracking-wide">
                      {activeTab === 'builder' ? 'Company' : 'Firm'}
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-navy-600 uppercase tracking-wide">
                      City
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-navy-600 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-navy-600 uppercase tracking-wide">
                      Submitted
                    </th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {displayedApps.map((app) => (
                    <AppRow
                      key={app._id}
                      app={app}
                      appType={activeTab}
                      onClick={() => setSelectedApp(app)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Review modal */}
      {selectedApp && (
        <ReviewModal
          application={selectedApp}
          appType={activeTab}
          onClose={() => setSelectedApp(null)}
          onSuccess={handleReviewSuccess}
        />
      )}

      {/* Approval result modal */}
      {approvalResult && (
        <ApprovalResultModal
          appType={approvalResult.appType}
          applicantName={approvalResult.applicantName}
          email={approvalResult.email}
          temporaryPassword={approvalResult.temporaryPassword}
          onClose={() => { setApprovalResult(null); fetchAll(); }}
        />
      )}
    </div>
  );
}
