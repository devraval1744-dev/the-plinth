import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../../components/layout/Navbar';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import AlertMessage from '../../../components/ui/AlertMessage';
import BlueprintViewer from '../../../components/blueprint/BlueprintViewer';
import PropertyStatusBadge from '../../../components/property/PropertyStatusBadge';
import {
  getPropertyBlueprintsApi,
  uploadBlueprintApi,
  replaceBlueprintApi,
  archiveBlueprintApi,
  triggerAnalysisApi,
  getAnalysisApi,
  retryAnalysisApi,
} from '../../../api/blueprints.api';
import { getMyPropertyByIdApi } from '../../../api/properties.api';
import { getErrorMessage } from '../../../api/client';
import { formatDate } from '../../../utils/format';
import { BLUEPRINT_TYPES } from '../../../types';
import type { Blueprint, BlueprintSlot, Property, BlueprintAnalysisJob } from '../../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupBlueprints(blueprints: Blueprint[], property: Property): BlueprintSlot[] {
  const slots: BlueprintSlot[] = [];

  // Slot 1: Full property blueprint
  const propBps = blueprints.filter((b) => b.level === 'PROPERTY');
  const activeProp = propBps.find((b) => b.status === 'ACTIVE') ?? null;
  slots.push({
    level: 'PROPERTY',
    label: 'Full Property Blueprint',
    active: activeProp,
    history: propBps.filter((b) => b.status === 'ARCHIVED'),
  });

  // Slots for each BHK config
  const seen = new Set<string>();
  for (const cfg of property.bhkConfigurations) {
    const key = `${cfg.type}||`;
    if (seen.has(key)) continue;
    seen.add(key);

    const unitBps = blueprints.filter(
      (b) => b.level === 'UNIT' && b.unitType === cfg.type && !b.unitLabel
    );
    const active = unitBps.find((b) => b.status === 'ACTIVE') ?? null;
    slots.push({
      level: 'UNIT',
      unitType: cfg.type,
      label: cfg.type,
      active,
      history: unitBps.filter((b) => b.status === 'ARCHIVED'),
    });
  }

  return slots;
}

function fileSizeLabel(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

interface UploadModalProps {
  slot: BlueprintSlot;
  propertyId: string;
  onClose: () => void;
  onSuccess: (bp: Blueprint) => void;
}

function UploadModal({ slot, propertyId, onClose, onSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(slot.active?.title ?? slot.label);
  const [bpType, setBpType] = useState(slot.active?.blueprintType ?? (slot.level === 'PROPERTY' ? 'Site Plan' : 'Unit Plan'));
  const [description, setDescription] = useState(slot.active?.description ?? '');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const isReplace = Boolean(slot.active);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
  };

  const handleSubmit = async () => {
    if (!file) { setError('Please select a file.'); return; }
    if (!title.trim()) { setError('Title is required.'); return; }
    setError(''); setIsUploading(true);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title.trim());
      fd.append('blueprintType', bpType);
      if (description.trim()) fd.append('description', description.trim());

      let result: Blueprint;
      if (isReplace && slot.active) {
        result = await replaceBlueprintApi(propertyId, slot.active._id, fd);
      } else {
        fd.append('level', slot.level as string);
        if (slot.unitType) fd.append('unitType', slot.unitType);
        if (slot.unitLabel) fd.append('unitLabel', slot.unitLabel);
        result = await uploadBlueprintApi(propertyId, fd);
      }
      onSuccess(result);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-card-hover w-full max-w-lg">
        <div className="flex items-start justify-between px-6 py-5 border-b border-navy-100">
          <div>
            <h2 className="font-display text-lg font-semibold text-navy-900">
              {isReplace ? 'Replace Blueprint' : 'Upload Blueprint'}
            </h2>
            <p className="text-sm text-navy-500 mt-0.5">{slot.label}</p>
          </div>
          <button onClick={onClose} className="text-navy-400 hover:text-navy-700 text-xl p-1 ml-4">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <AlertMessage type="error" message={error} />}
          {isReplace && (
            <AlertMessage type="info" message="Uploading a new file will archive the current blueprint as a previous version." />
          )}

          {/* File picker */}
          <div>
            <label className="label">Blueprint file *</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
              onChange={handleFile}
              className="block w-full text-sm text-navy-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-navy-100 file:text-navy-700 hover:file:bg-navy-200"
            />
            {file && <p className="text-xs text-navy-500 mt-1">{file.name} · {fileSizeLabel(file.size)}</p>}
            <p className="text-xs text-navy-400 mt-1">Accepted: PDF, PNG, JPG, WEBP · Max 20 MB</p>
          </div>

          {/* Title */}
          <div>
            <label className="label">Title *</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Shivalay Heights – 2 BHK Floor Plan" />
          </div>

          {/* Blueprint type */}
          <div>
            <label className="label">Blueprint type *</label>
            <select className="input" value={bpType} onChange={(e) => setBpType(e.target.value)}>
              {BLUEPRINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="label">Description <span className="text-navy-400 font-normal">(optional)</span></label>
            <textarea rows={2} className="input resize-none" value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this blueprint…" />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSubmit} disabled={isUploading || !file}
              className="btn-primary btn flex-1">
              {isUploading ? <><LoadingSpinner size="sm" /> Uploading…</> : isReplace ? 'Replace Blueprint' : 'Upload Blueprint'}
            </button>
            <button onClick={onClose} disabled={isUploading} className="btn-secondary btn">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Analysis panel (per slot) ────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not analysed',
  QUEUED: 'Queued…',
  PROCESSING: 'Analysing…',
  STRUCTURE_EXTRACTED: 'Extracting structure…',
  COMPLETED: 'Analysis complete',
  FAILED: 'Analysis failed',
  NEEDS_REVIEW: 'Needs review',
};
const STATUS_BADGE: Record<string, string> = {
  NOT_STARTED: 'badge-navy',
  QUEUED: 'badge bg-blue-100 text-blue-700',
  PROCESSING: 'badge bg-blue-100 text-blue-700',
  STRUCTURE_EXTRACTED: 'badge bg-blue-100 text-blue-700',
  COMPLETED: 'badge-success',
  FAILED: 'badge-danger',
  NEEDS_REVIEW: 'badge-warning',
};

function AnalysisPanel({
  blueprint,
  propertyId,
}: {
  blueprint: Blueprint;
  propertyId: string;
}) {
  const [job, setJob] = useState<BlueprintAnalysisJob | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAnalysisApi(propertyId, blueprint._id)
      .then(setJob)
      .catch(() => setJob(null));
  }, [blueprint._id, blueprint.version, propertyId]);

  const handleAnalyze = async () => {
    setIsWorking(true); setError('');
    try {
      await triggerAnalysisApi(propertyId, blueprint._id);
      // Poll once after a short delay to catch synchronous completion
      setTimeout(async () => {
        const updated = await getAnalysisApi(propertyId, blueprint._id);
        setJob(updated);
        setIsWorking(false);
      }, 1800);
    } catch (e) {
      setError(getErrorMessage(e));
      setIsWorking(false);
    }
  };

  const handleRetry = async () => {
    setIsWorking(true); setError('');
    try {
      await retryAnalysisApi(propertyId, blueprint._id);
      setTimeout(async () => {
        const updated = await getAnalysisApi(propertyId, blueprint._id);
        setJob(updated);
        setIsWorking(false);
      }, 1800);
    } catch (e) {
      setError(getErrorMessage(e));
      setIsWorking(false);
    }
  };

  const status = job?.status ?? 'NOT_STARTED';
  const inProgress = status === 'QUEUED' || status === 'PROCESSING' || status === 'STRUCTURE_EXTRACTED' || isWorking;
  const isOldProvider = job?.status === 'COMPLETED' && job?.provider === 'demo';

  return (
    <div className="border-t border-navy-100 pt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-navy-600">3D Analysis</span>
          <span className={STATUS_BADGE[status] ?? 'badge-navy'}>
            {STATUS_LABELS[status] ?? status}
          </span>
          {job?.isDemo && <span className="badge bg-amber-100 text-amber-700 text-xs">Demo AI</span>}
          {job?.provider && (
            <span className="text-xs text-navy-400">{job.provider}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === 'NOT_STARTED' && (
            <button onClick={handleAnalyze} disabled={isWorking} className="btn btn-secondary text-xs px-3 py-1.5">
              {isWorking ? <LoadingSpinner size="sm" /> : '▶ Analyse Blueprint'}
            </button>
          )}
          {(status === 'FAILED' || status === 'NEEDS_REVIEW') && (
            <button onClick={handleRetry} disabled={isWorking} className="btn btn-secondary text-xs px-3 py-1.5">
              {isWorking ? <LoadingSpinner size="sm" /> : '↺ Retry'}
            </button>
          )}
          {status === 'COMPLETED' && (
            <button
              onClick={handleRetry}
              disabled={isWorking}
              className="btn btn-secondary text-xs px-3 py-1.5"
              title={isOldProvider ? 'Previous analysis used the generic demo provider. Re-analyze to use the blueprint-aware provider.' : 'Re-run analysis with the current provider'}
            >
              {isWorking ? <LoadingSpinner size="sm" /> : '↺ Re-analyze'}
            </button>
          )}
          {inProgress && <LoadingSpinner size="sm" />}
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {isOldProvider && !isWorking && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-1.5">
          This analysis used the generic demo provider. Click Re-analyze to use the blueprint-aware provider for a more accurate 3D layout.
        </p>
      )}
      {status === 'FAILED' && job?.errorMessage && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{job.errorMessage}</p>
      )}
      {status === 'COMPLETED' && (
        <p className="text-xs text-green-700">
          ✓ Spatial structure extracted · v{job?.blueprintVersion} · {job?.analysis?.rooms.length ?? 0} rooms
        </p>
      )}
    </div>
  );
}

// ─── Slot card ────────────────────────────────────────────────────────────────

function SlotCard({
  slot,
  propertyId,
  onUpload,
  onArchive,
}: {
  slot: BlueprintSlot;
  propertyId: string;
  onUpload: (slot: BlueprintSlot) => void;
  onArchive: (bp: Blueprint) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [viewing, setViewing] = useState(false);

  const hasHistory = slot.history.length > 0;

  return (
    <div className="card px-5 py-5 space-y-4">
      {/* Slot header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-navy-800 text-sm">{slot.label}</span>
            {slot.level === 'PROPERTY' && (
              <span className="badge bg-purple-100 text-purple-700 text-xs">Property-wide</span>
            )}
            {slot.level === 'UNIT' && (
              <span className="badge bg-indigo-100 text-indigo-700 text-xs">Unit Blueprint</span>
            )}
          </div>
          {slot.active && (
            <p className="text-xs text-navy-500 mt-0.5">
              v{slot.active.version} · {slot.active.blueprintType} · {slot.active.fileName} · {fileSizeLabel(slot.active.fileSizeBytes)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {slot.active && (
            <>
              <button onClick={() => setViewing((v) => !v)}
                className="btn btn-secondary text-xs px-3 py-1.5">
                {viewing ? 'Hide' : 'View'}
              </button>
              <button onClick={() => onUpload(slot)}
                className="btn btn-secondary text-xs px-3 py-1.5">
                Replace
              </button>
              <button onClick={() => onArchive(slot.active!)}
                className="text-xs text-navy-400 hover:text-red-600 transition-colors">
                Archive
              </button>
            </>
          )}
          {!slot.active && (
            <button onClick={() => onUpload(slot)} className="btn btn-gold text-xs px-3 py-1.5">
              + Upload
            </button>
          )}
        </div>
      </div>

      {/* Inline viewer */}
      {viewing && slot.active && (
        <div className="border-t border-navy-100 pt-4">
          <BlueprintViewer blueprint={slot.active} />
        </div>
      )}

      {/* No blueprint */}
      {!slot.active && (
        <div className="bg-cream-100 rounded-lg px-4 py-4 text-center">
          <p className="text-sm text-navy-500">No blueprint uploaded yet.</p>
        </div>
      )}

      {/* AI Analysis panel — only for active blueprints */}
      {slot.active && (
        <AnalysisPanel blueprint={slot.active} propertyId={propertyId} />
      )}

      {/* Version history */}
      {hasHistory && (
        <div>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs text-navy-500 hover:text-navy-800 transition-colors"
          >
            {showHistory ? '▴ Hide' : '▾ Show'} version history ({slot.history.length})
          </button>
          {showHistory && (
            <div className="mt-3 space-y-2">
              {slot.history.map((h) => (
                <div key={h._id} className="flex items-center justify-between bg-cream-100 rounded-lg px-3 py-2 text-xs text-navy-500">
                  <span>v{h.version} · {h.blueprintType} · {h.fileName} · {fileSizeLabel(h.fileSizeBytes)}</span>
                  <span>{formatDate(h.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BlueprintManagementPage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();

  const [property, setProperty] = useState<Property | null>(null);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadTarget, setUploadTarget] = useState<BlueprintSlot | null>(null);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!propertyId) return;
    Promise.all([
      getMyPropertyByIdApi(propertyId),
      getPropertyBlueprintsApi(propertyId),
    ])
      .then(([prop, bps]) => {
        setProperty(prop);
        setBlueprints(bps);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setIsLoading(false));
  }, [propertyId]);

  const handleUploadSuccess = (bp: Blueprint) => {
    // Refresh blueprint list from local state optimistically
    setBlueprints((prev) => {
      // Archive any previous active in the same slot
      const updated = prev.map((b) => {
        if (
          b.level === bp.level &&
          b.unitType === bp.unitType &&
          b.unitLabel === bp.unitLabel &&
          b.status === 'ACTIVE' &&
          b._id !== bp._id
        ) {
          return { ...b, status: 'ARCHIVED' as const };
        }
        return b;
      });
      // Add the new one if not already present
      return updated.find((b) => b._id === bp._id)
        ? updated
        : [...updated, bp];
    });
    setUploadTarget(null);
    setSuccess('Blueprint uploaded successfully.');
    setTimeout(() => setSuccess(''), 4000);
  };

  const handleArchive = async (bp: Blueprint) => {
    if (!propertyId) return;
    if (!window.confirm('Archive this blueprint? It will no longer be the active version.')) return;
    try {
      const archived = await archiveBlueprintApi(propertyId, bp._id);
      setBlueprints((prev) => prev.map((b) => (b._id === archived._id ? archived : b)));
    } catch (e) {
      alert(getErrorMessage(e));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-200"><Navbar />
        <div className="flex items-center justify-center py-32"><LoadingSpinner size="lg" /></div>
      </div>
    );
  }

  const slots = property ? groupBlueprints(blueprints, property) : [];
  const propertySlot  = slots.filter((s) => s.level === 'PROPERTY');
  const unitSlots     = slots.filter((s) => s.level === 'UNIT');

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />
      <main className="page-container py-8 space-y-6">
        {/* Header */}
        <div>
          <button onClick={() => navigate(`/builder/properties`)}
            className="text-navy-500 hover:text-navy-800 text-sm mb-1 block">
            ← My Listings
          </button>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-2xl font-semibold text-navy-900">
                  {property?.projectName ?? 'Blueprints'}
                </h1>
                {property && <PropertyStatusBadge status={property.status} />}
              </div>
              <p className="text-navy-500 text-sm mt-0.5">
                Blueprint Management · {property?.locality}, {property?.city}
              </p>
            </div>
            <button onClick={() => navigate(`/builder/properties/${propertyId}/edit`)}
              className="btn-secondary btn text-sm">
              Property Details
            </button>
          </div>
        </div>

        {error && <AlertMessage type="error" message={error} />}
        {success && <AlertMessage type="success" message={success} />}

        {/* Property blueprint */}
        <section className="space-y-3">
          <h2 className="section-title">Full Property Blueprint</h2>
          <p className="text-sm text-navy-500">
            Upload the complete site plan or overall project layout. This appears to customers as a project-wide document.
          </p>
          {propertySlot.map((slot) => (
            <SlotCard key={`${slot.level}-${slot.unitType ?? ''}-${slot.unitLabel ?? ''}`}
              slot={slot}
              propertyId={propertyId!}
              onUpload={setUploadTarget}
              onArchive={handleArchive} />
          ))}
        </section>

        {/* Unit blueprints */}
        <section className="space-y-3">
          <h2 className="section-title">Unit Blueprints</h2>
          <p className="text-sm text-navy-500">
            Upload a separate blueprint for each unit configuration. Each unit type has its own independent blueprint and version history.
          </p>
          {unitSlots.length === 0 && (
            <div className="card px-5 py-6 text-center text-navy-500 text-sm">
              No BHK configurations found. Add unit configurations to the property first.
            </div>
          )}
          {unitSlots.map((slot) => (
            <SlotCard key={`${slot.level}-${slot.unitType ?? ''}-${slot.unitLabel ?? ''}`}
              slot={slot}
              propertyId={propertyId!}
              onUpload={setUploadTarget}
              onArchive={handleArchive} />
          ))}
        </section>
      </main>

      {uploadTarget && propertyId && (
        <UploadModal
          slot={uploadTarget}
          propertyId={propertyId}
          onClose={() => setUploadTarget(null)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}
