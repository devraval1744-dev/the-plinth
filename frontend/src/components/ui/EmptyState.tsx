import type { ReactNode } from 'react';

interface Props {
  icon: string;
  title: string;
  message: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, message, action }: Props) {
  return (
    <div className="card px-6 py-12 text-center space-y-3">
      <div className="text-5xl" aria-hidden="true">{icon}</div>
      <h3 className="font-display text-xl font-semibold text-navy-800">{title}</h3>
      <p className="text-sm text-navy-500 max-w-md mx-auto">{message}</p>
      {action && <div className="pt-2 flex justify-center">{action}</div>}
    </div>
  );
}

/** Inline error with retry, for sections that load independently. */
export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="card border-red-200 bg-red-50 px-5 py-4 flex items-center justify-between gap-4">
      <p className="text-sm text-red-800">{message}</p>
      <button onClick={onRetry} className="btn-secondary text-xs px-3 py-1.5 shrink-0">Try again</button>
    </div>
  );
}
