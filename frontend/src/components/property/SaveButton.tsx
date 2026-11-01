import type { MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';

interface Props {
  propertyId: string;
  /** 'overlay' sits on a photo; 'button' is a labelled button for action panels. */
  variant?: 'overlay' | 'button';
  className?: string;
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3 5 6.5 5c2 0 3.5 1.1 5.5 3.2C14 6.1 15.5 5 17.5 5 21 5 22.8 8.6 21.5 11.8 19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

/** Save / un-save a property. Guests are sent to sign in; non-customers don't see it. */
export default function SaveButton({ propertyId, variant = 'overlay', className = '' }: Props) {
  const { user, isAuthenticated } = useAuth();
  const favorites = useFavorites();
  const navigate = useNavigate();
  const location = useLocation();

  if (isAuthenticated && user?.role !== 'CUSTOMER') return null;

  const saved = favorites.isSaved(propertyId);
  const busy = favorites.isPending(propertyId);

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } });
      return;
    }
    void favorites.toggle(propertyId);
  };

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={saved}
        className={`btn ${saved ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' : 'btn-secondary'} ${className}`}
      >
        <span className={saved ? 'text-red-500' : ''}><Heart filled={saved} /></span>
        {saved ? 'Saved' : 'Save property'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved properties' : 'Save property'}
      title={isAuthenticated ? (saved ? 'Remove from saved' : 'Save property') : 'Sign in to save'}
      className={`w-9 h-9 rounded-full flex items-center justify-center bg-white/95 shadow-card transition-all
        hover:scale-110 disabled:opacity-70 ${saved ? 'text-red-500' : 'text-navy-500 hover:text-red-500'} ${className}`}
    >
      <Heart filled={saved} />
    </button>
  );
}
