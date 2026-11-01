import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';
import Modal from '../ui/Modal';

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex-1 flex flex-col items-center gap-1 py-2.5 text-xs transition-colors ${
    isActive ? 'text-navy-800 font-semibold' : 'text-navy-400'
  }`;

/** Bottom tab bar for customers on small screens. Pages using it should add `pb-24 sm:pb-8`. */
export default function CustomerMobileNav() {
  const { logout } = useAuth();
  const favorites = useFavorites();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-navy-100 flex sm:hidden z-40 shadow-nav" aria-label="Mobile">
        <NavLink to="/home" end className={tab}>
          <span className="text-lg leading-none" aria-hidden="true">🏠</span><span>Home</span>
        </NavLink>
        <NavLink to="/properties" className={tab}>
          <span className="text-lg leading-none" aria-hidden="true">🔍</span><span>Search</span>
        </NavLink>
        <NavLink to="/saved" className={tab}>
          <span className="text-lg leading-none relative" aria-hidden="true">
            🔖
            {favorites.count > 0 && (
              <span className="absolute -top-1 -right-3 text-[9px] bg-gold-500 text-white rounded-full px-1 leading-4">{favorites.count}</span>
            )}
          </span>
          <span>Saved</span>
        </NavLink>
        <NavLink to="/visits" className={tab}>
          <span className="text-lg leading-none" aria-hidden="true">📅</span><span>Visits</span>
        </NavLink>
        <button onClick={() => setMoreOpen(true)} className="flex-1 flex flex-col items-center gap-1 py-2.5 text-xs text-navy-400">
          <span className="text-lg leading-none" aria-hidden="true">⋯</span><span>More</span>
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="divide-y divide-navy-100 -my-2">
          {[
            { to: '/dsa-connect', icon: '🤝', label: 'DSA connections' },
            { to: '/compare', icon: '⇄', label: 'Compare properties' },
            { to: '/notifications', icon: '🔔', label: 'Notifications' },
            { to: '/customer/profile', icon: '👤', label: 'My profile' },
          ].map((i) => (
            <li key={i.to}>
              <Link to={i.to} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 py-3.5 text-navy-800 font-medium">
                <span className="w-6 text-center" aria-hidden="true">{i.icon}</span>{i.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              onClick={async () => { setMoreOpen(false); await logout(); navigate('/login'); }}
              className="flex items-center gap-3 py-3.5 text-red-600 font-medium w-full"
            >
              <span className="w-6 text-center" aria-hidden="true">↪</span>Log out
            </button>
          </li>
        </ul>
      </Modal>
    </>
  );
}
