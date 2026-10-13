import LoadingSpinner from './LoadingSpinner';

export default function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-200">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-navy-500 text-sm">Loading…</p>
      </div>
    </div>
  );
}
