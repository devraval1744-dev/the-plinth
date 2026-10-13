import { useState, useRef } from 'react';
import type { Blueprint } from '../../types';
import { formatDate } from '../../utils/format';

interface Props {
  blueprint: Blueprint;
  /** Backend origin for resolving relative fileUrls */
  apiBase?: string;
}

function fileSizeLabel(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

function isPdf(mime: string): boolean {
  return mime === 'application/pdf';
}

/** Resolve potentially relative URL to absolute */
function resolveUrl(url: string): string {
  if (url.startsWith('http')) return url;
  // For local dev: prepend backend origin
  return `http://localhost:5001${url}`;
}

export default function BlueprintViewer({ blueprint }: Props) {
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const fileUrl = resolveUrl(blueprint.fileUrl);
  const image   = isImage(blueprint.fileMimeType);
  const pdf     = isPdf(blueprint.fileMimeType);

  const resetZoom = () => setZoom(1);
  const zoomIn    = () => setZoom((z) => Math.min(z + 0.25, 4));
  const zoomOut   = () => setZoom((z) => Math.max(z - 0.25, 0.25));

  return (
    <div className={`space-y-4 ${fullscreen ? 'fixed inset-0 z-50 bg-navy-950 flex flex-col p-4' : ''}`}>
      {/* Metadata bar */}
      <div className={`flex flex-wrap items-center justify-between gap-3 ${fullscreen ? 'text-cream-200' : ''}`}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-navy-900">{blueprint.title}</span>
            {blueprint.unitType && (
              <span className="badge bg-indigo-100 text-indigo-800 text-xs">
                {blueprint.unitType}{blueprint.unitLabel ? ` – ${blueprint.unitLabel}` : ''}
              </span>
            )}
            <span className="badge-navy text-xs">v{blueprint.version}</span>
            <span className="badge bg-cream-200 text-navy-600 text-xs">{blueprint.blueprintType}</span>
          </div>
          <p className="text-xs text-navy-500 mt-0.5">
            {blueprint.fileName} · {fileSizeLabel(blueprint.fileSizeBytes)} · Updated {formatDate(blueprint.updatedAt)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {image && (
            <>
              <button onClick={zoomOut} className="btn btn-secondary text-xs px-2 py-1" title="Zoom out">−</button>
              <span className="text-xs text-navy-600 min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={zoomIn}  className="btn btn-secondary text-xs px-2 py-1" title="Zoom in">+</button>
              <button onClick={resetZoom} className="btn btn-secondary text-xs px-2 py-1" title="Reset zoom">↺</button>
            </>
          )}
          <button
            onClick={() => setFullscreen((v) => !v)}
            className="btn btn-secondary text-xs px-2 py-1"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? '⤡' : '⤢'}
          </button>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary text-xs px-2 py-1"
            title="Open in new tab"
          >
            ↗ Open
          </a>
        </div>
      </div>

      {/* Viewer area */}
      <div
        className={`
          border border-navy-200 rounded-xl overflow-auto bg-navy-50
          ${fullscreen ? 'flex-1' : 'max-h-[600px]'}
          flex items-start justify-center
        `}
      >
        {image && (
          <img
            ref={imgRef}
            src={fileUrl}
            alt={blueprint.title}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.15s' }}
            className="max-w-none m-4"
          />
        )}

        {pdf && (
          <div className="w-full h-full min-h-[500px] p-4 flex flex-col items-center justify-center space-y-4">
            <div className="text-5xl opacity-30">📄</div>
            <p className="text-sm font-medium text-navy-700">{blueprint.fileName}</p>
            <p className="text-xs text-navy-500">{fileSizeLabel(blueprint.fileSizeBytes)} PDF</p>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary btn"
            >
              Open PDF in New Tab
            </a>
          </div>
        )}

        {!image && !pdf && (
          <div className="p-8 text-center text-navy-500 text-sm">
            Preview not available for this file type.{' '}
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="underline">Download file</a>
          </div>
        )}
      </div>

      {/* Disclosure */}
      <p className="text-xs text-navy-400 leading-relaxed">
        Blueprint provided by the Builder. This document is for informational purposes and is not a
        substitute for approved architectural, engineering or legal documentation.
      </p>

      {fullscreen && (
        <button
          onClick={() => setFullscreen(false)}
          className="absolute top-4 right-4 btn btn-secondary text-sm"
        >
          ✕ Close
        </button>
      )}
    </div>
  );
}
