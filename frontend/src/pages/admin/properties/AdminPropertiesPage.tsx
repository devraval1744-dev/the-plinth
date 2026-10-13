import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../../components/layout/Navbar';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import AlertMessage from '../../../components/ui/AlertMessage';
import PropertyStatusBadge from '../../../components/property/PropertyStatusBadge';
import BlueprintViewer from '../../../components/blueprint/BlueprintViewer';
import {
  adminListPropertiesApi,
  adminGetPropertyApi,
  adminReviewPropertyApi,
} from '../../../api/properties.api';
import { getAdminPropertyBlueprintsApi, adminGetAnalysisApi } from '../../../api/blueprints.api';
import { getErrorMessage } from '../../../api/client';
import { formatPriceRange, formatDate, getBuilderName, getPrimaryImage } from '../../../utils/format';
import type { Property, PropertyReviewPayload, Blueprint, BlueprintAnalysisJob } from '../../../types';

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Submitted', value: 'SUBMITTED' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Changes Requested', value: 'CHANGES_REQUESTED' },
];

// ─── Review Modal ─────────────────────────────────────────────────────────────

function ReviewModal({
  property,
  onClose,
  onSuccess,
}: {
  property: Property;
  onClose: () => void;
  onSuccess: (updated: Property) => void;
}) {
  const [action, setAction] = useState<PropertyReviewPayload['action'] | ''>('');
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedBpId, setSelectedBpId] = useState<string | null>(null);
  const [analysisMap, setAnalysisMap] = useState<Record<string, BlueprintAnalysisJob | null>>({});

  // Load blueprints and their analysis when modal opens
  useEffect(() => {
    getAdminPropertyBlueprintsApi(property._id)
      .then((bps) => {
        setBlueprints(bps);
        // Fetch analysis for each active blueprint
        bps.filter((b) => b.status === 'ACTIVE').forEach((bp) => {
          adminGetAnalysisApi(property._id, bp._id)
            .then((job) => setAnalysisMap((prev) => ({ ...prev, [bp._id]: job })))
            .catch(() => {});
        });
      })
      .catch(() => { /* non-critical */ });
  }, [property._id]);

  const builderName = getBuilderName(property.builderId as any);
  const primaryImage = getPrimaryImage(property.images, property.coverImageUrl);
  const canReview = property.status === 'SUBMITTED';

  const handleReview = async () => {
    if (!action) return;
    setIsLoading(true); setError('');
    try {
      const payload: PropertyReviewPayload = {
        action,
        ...(adminNotes.trim() ? { adminNotes: adminNotes.trim() } : {}),
        ...(action === 'reject' && rejectionReason.trim() ? { rejectionReason: rejectionReason.trim() } : {}),
      };
      const updated = await adminReviewPropertyApi(property._id, payload);
      onSuccess(updated);
    } catch (e) {
      setError(getErrorMessage(e));
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-navy-950/60 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-card-hover w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-navy-100">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="font-display text-xl font-semibold text-navy-900">{property.projectName}</h2>
              <PropertyStatusBadge status={property.status} />
              {property.pendingReApproval && (
                <span className="badge bg-blue-100 text-blue-700 text-xs">Re-approval</span>
              )}
            </div>
            <p className="text-sm text-navy-500">{property.title} · {property.locality}, {property.city}</p>
          </div>
          <button onClick={onClose} className="text-navy-400 hover:text-navy-700 text-xl p-1 ml-4">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Image */}
          {primaryImage && (
            <img src={primaryImage} alt={property.projectName}
              className="w-full h-48 object-cover rounded-xl border border-navy-100" />
          )}

          {/* Key details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Builder" value={builderName} />
            <Detail label="Type" value={property.propertyType} />
            <DetailPrice label="Price" value={formatPriceRange(property.minPrice, property.maxPrice)} />
            <Detail label="Area" value={`${property.minArea}–${property.maxArea} sq.ft`} />
            <Detail label="Units" value={`${property.availableUnits} / ${property.totalUnits} available`} />
            <Detail label="Status" value={property.constructionStatus} />
            <Detail label="Submitted" value={formatDate(property.submittedAt)} />
            <Detail label="BHK types" value={property.bhkConfigurations.map((b) => b.type).join(', ') || '—'} />
          </div>

          {/* Description */}
          <div>
            <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Description</p>
            <p className="text-sm text-navy-700 bg-cream-100 rounded-lg px-4 py-3 leading-relaxed line-clamp-4">
              {property.description}
            </p>
          </div>

          {/* Amenities */}
          {property.amenities.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Amenities</p>
              <div className="flex flex-wrap gap-1.5">
                {property.amenities.map((a) => (
                  <span key={a} className="badge-navy text-xs">{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* Blueprints (admin view) */}
          {blueprints.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Blueprints & AI Analysis</p>
              <div className="space-y-2">
                {blueprints.filter((b) => b.status === 'ACTIVE').map((bp) => {
                  const job = analysisMap[bp._id];
                  return (
                    <div key={bp._id}>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => setSelectedBpId((prev) => prev === bp._id ? null : bp._id)}
                          className={`flex-1 text-left px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                            selectedBpId === bp._id
                              ? 'bg-navy-700 text-cream-100 border-navy-700'
                              : 'border-navy-200 text-navy-600 hover:border-navy-400'
                          }`}
                        >
                          {bp.level === 'PROPERTY' ? '📐 Property Blueprint' : `🏠 ${bp.unitType} – ${bp.blueprintType}`}
                          <span className="ml-2 opacity-60">v{bp.version}</span>
                        </button>
                        {job && (
                          <span className={`badge text-xs shrink-0 ${
                            job.status === 'COMPLETED' ? 'badge-success'
                            : job.status === 'FAILED' ? 'badge-danger'
                            : 'badge bg-blue-100 text-blue-700'
                          }`}>
                            {job.isDemo ? 'Demo AI' : 'AI'}: {job.status.toLowerCase().replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      {selectedBpId === bp._id && (
                        <div className="mt-2">
                          <BlueprintViewer blueprint={bp} />
                          {job?.status === 'COMPLETED' && job.analysis && (
                            <div className="mt-2 bg-cream-100 rounded-lg px-3 py-2 text-xs text-navy-600">
                              <p className="font-semibold mb-1">Analysis summary (v{job.blueprintVersion})</p>
                              <p>Provider: {job.provider}{job.isDemo ? ' (demo)' : ''} · Rooms: {job.analysis.rooms.length} · Walls: {job.analysis.walls.length}</p>
                              <p>Canvas: {job.analysis.canvas_width}m × {job.analysis.canvas_height}m</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Existing notes */}
          {property.adminNotes && (
            <div className="bg-navy-50 border border-navy-200 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-navy-600 mb-1">Previous admin notes:</p>
              <p className="text-sm text-navy-700">{property.adminNotes}</p>
            </div>
          )}

          {/* Review actions */}
          {canReview && (
            <div className="border-t border-navy-100 pt-5 space-y-4">
              <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Review Action</p>
              {error && <AlertMessage type="error" message={error} />}

              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'approve', label: '✓ Approve', cls: 'border-green-300 bg-green-50 text-green-800' },
                  { value: 'reject', label: '✕ Reject', cls: 'border-red-300 bg-red-50 text-red-800' },
                  { value: 'request_changes', label: '↩ Request Changes', cls: 'border-amber-300 bg-amber-50 text-amber-800' },
                ].map(({ value, label, cls }) => (
                  <button key={value} type="button"
                    onClick={() => setAction(value as PropertyReviewPayload['action'])}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      action === value ? `${cls} ring-2 ring-offset-1 ring-current` : 'border-navy-200 text-navy-600 hover:border-navy-400'
                    }`}>{label}</button>
                ))}
              </div>

              {action && (
                <div className="space-y-3">
                  <div>
                    <label className="label">Admin notes (internal)</label>
                    <textarea rows={2} className="input resize-none" value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Optional internal notes for this decision…" />
                  </div>
                  {action === 'reject' && (
                    <div>
                      <label className="label">Rejection reason * <span className="font-normal text-navy-400">(shown to builder)</span></label>
                      <textarea rows={2} className="input resize-none" value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Explain why this property cannot be listed…" />
                    </div>
                  )}
                  {action === 'request_changes' && (
                    <div>
                      <label className="label">Changes needed * <span className="font-normal text-navy-400">(shown to builder)</span></label>
                      <textarea rows={2} className="input resize-none" value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Describe exactly what needs to be updated or corrected…" />
                    </div>
                  )}

                  {!confirmOpen ? (
                    <button type="button"
                      disabled={
                        !action ||
                        (action === 'reject' && !rejectionReason.trim()) ||
                        (action === 'request_changes' && !adminNotes.trim())
                      }
                      onClick={() => setConfirmOpen(true)}
                      className={`btn btn-lg w-full ${
                        action === 'approve' ? 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-400'
                        : action === 'reject' ? 'btn-danger'
                        : 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400'
                      }`}>
                      {action === 'approve' ? 'Approve Property' : action === 'reject' ? 'Reject Property' : 'Request Changes'}
                    </button>
                  ) : (
                    <div className="bg-cream-100 rounded-lg px-4 py-4 space-y-3">
                      <p className="text-sm font-medium text-navy-800">Confirm this decision?</p>
                      <div className="flex gap-3">
                        <button type="button" onClick={handleReview} disabled={isLoading}
                          className={`btn flex-1 ${action === 'approve' ? 'bg-green-600 text-white hover:bg-green-700' : action === 'reject' ? 'btn-danger' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
                          {isLoading ? <LoadingSpinner size="sm" /> : 'Confirm'}
                        </button>
                        <button type="button" onClick={() => setConfirmOpen(false)} disabled={isLoading}
                          className="btn btn-secondary flex-1">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Already decided */}
          {!canReview && (
            <div className={`rounded-lg px-4 py-3 text-sm ${
              property.status === 'APPROVED' ? 'bg-green-50 border border-green-200 text-green-800'
              : property.status === 'REJECTED' ? 'bg-red-50 border border-red-200 text-red-800'
              : 'bg-amber-50 border border-amber-200 text-amber-800'
            }`}>
              Property status: <strong>{property.status}</strong>
              {property.adminNotes && <> — {property.adminNotes}</>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div><span className="text-xs text-navy-500 block">{label}</span>
    <span className="text-navy-800 font-medium">{value}</span></div>
  );
}

function DetailPrice({ label, value }: { label: string; value: string }) {
  return (
    <div><span className="text-xs text-navy-500 block">{label}</span>
    <span className="price-text-sm">{value}</span></div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPropertiesPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('SUBMITTED');
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [total, setTotal] = useState(0);

  const fetchProperties = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const result = await adminListPropertiesApi(statusFilter || undefined);
      setProperties(result.properties as Property[]);
      setTotal(result.total);
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setIsLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  const handleOpenProperty = async (id: string) => {
    try {
      const p = await adminGetPropertyApi(id);
      setSelectedProperty(p);
    } catch (e) { alert(getErrorMessage(e)); }
  };

  const handleReviewSuccess = (updated: Property) => {
    setProperties((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
    setSelectedProperty(null);
  };

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />
      <main className="page-container py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/admin')} className="text-navy-500 hover:text-navy-800 text-sm">← Dashboard</button>
            <div>
              <h1 className="font-display text-2xl font-semibold text-navy-900">Property Review</h1>
              <p className="text-navy-500 text-sm">{total} properties · Review submitted listings</p>
            </div>
          </div>
          <button
            onClick={() => fetchProperties()}
            disabled={isLoading}
            className="btn btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
            title="Refresh latest property submissions"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {error && <AlertMessage type="error" message={error} />}

        {/* Status filter */}
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map(({ label, value }) => (
            <button key={value} onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === value ? 'bg-navy-800 text-cream-100' : 'text-navy-500 hover:bg-navy-100'
              }`}>{label}</button>
          ))}
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><LoadingSpinner size="lg" /></div>
          ) : properties.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🏢</div>
              <p className="font-medium text-navy-700">No properties found</p>
              <p className="text-sm text-navy-500 mt-1">
                {statusFilter ? `No ${statusFilter.toLowerCase()} properties yet.` : 'No properties in the system.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-100 bg-cream-100 text-left text-xs font-semibold text-navy-600 uppercase tracking-wide">
                    <th className="px-5 py-3">Property</th>
                    <th className="px-5 py-3">Builder</th>
                    <th className="px-5 py-3">Location</th>
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Submitted</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {properties.map((p) => (
                    <tr key={p._id} onClick={() => handleOpenProperty(p._id)}
                      className="hover:bg-cream-100 cursor-pointer transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-medium text-navy-800 text-sm">{p.projectName}</div>
                        <div className="text-xs text-navy-500">{p.propertyType}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-navy-700">{getBuilderName(p.builderId as any)}</td>
                      <td className="px-5 py-4 text-sm text-navy-700">
                        <div>{p.locality}</div>
                        <div className="text-xs text-navy-500">{p.city}</div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="price-text-sm">
                          {formatPriceRange(p.minPrice, p.maxPrice)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <PropertyStatusBadge status={p.status} />
                          {p.pendingReApproval && (
                            <span className="badge bg-blue-100 text-blue-700 text-xs">Re-approval</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs text-navy-500 whitespace-nowrap">
                        {formatDate(p.submittedAt)}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-navy-500 text-sm hover:text-navy-800">Review →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {selectedProperty && (
        <ReviewModal property={selectedProperty} onClose={() => setSelectedProperty(null)}
          onSuccess={handleReviewSuccess} />
      )}
    </div>
  );
}
