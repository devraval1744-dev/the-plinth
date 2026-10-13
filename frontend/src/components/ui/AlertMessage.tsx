interface Props {
  type?: 'error' | 'success' | 'warning' | 'info';
  message: string;
  className?: string;
}

const styles = {
  error:   'bg-red-50 border-red-200 text-red-800',
  success: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info:    'bg-navy-50 border-navy-200 text-navy-800',
};

const icons = {
  error:   '✕',
  success: '✓',
  warning: '⚠',
  info:    'ℹ',
};

export default function AlertMessage({ type = 'error', message, className = '' }: Props) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={`
        flex items-start gap-3 rounded-lg border px-4 py-3 text-sm
        ${styles[type]} ${className}
      `}
    >
      <span className="mt-0.5 font-semibold" aria-hidden="true">{icons[type]}</span>
      <span>{message}</span>
    </div>
  );
}
