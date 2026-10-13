interface Props {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-[3px]',
};

export default function LoadingSpinner({ size = 'md', className = '' }: Props) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`
        inline-block rounded-full border-navy-200 border-t-navy-700
        animate-spin ${sizeMap[size]} ${className}
      `}
    />
  );
}
