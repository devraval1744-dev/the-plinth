import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';
import NotificationBell from './NotificationBell';
import type { UserRole } from '../../types';

const roleLabel: Record<UserRole, string> = {
  CUSTOMER: 'Customer',
  BUILDER:  'Builder',
  ADMIN:    'Admin',
  DSA:      'DSA Partner',
};

const roleBadgeStyle: Record<UserRole, string> = {
  CUSTOMER: 'badge-navy',
  BUILDER:  'badge bg-indigo-100 text-indigo-800',
  ADMIN:    'badge bg-purple-100 text-purple-800',
  DSA:      'badge bg-teal-100 text-teal-800',
};

interface NavItem { to: string; label: string; end?: boolean }

function getNavItems(role: UserRole): NavItem[] {
  switch (role) {
    case 'CUSTOMER':
      return [
        { to: '/home', label: 'Home', end: true },
        { to: '/properties', label: 'Properties' },
        { to: '/saved', label: 'Saved' },
        { to: '/visits', label: 'Visits' },
        { to: '/dsa-connect', label: 'DSA' },
      ];
    case 'BUILDER':
      return [
        { to: '/builder', label: 'Dashboard', end: true },
        { to: '/builder/properties', label: 'Listings' },
        { to: '/builder/visits', label: 'Site Visits' },
      ];
    case 'DSA':
      return [
        { to: '/dsa', label: 'Dashboard', end: true },
        { to: '/dsa/leads', label: 'Leads' },
      ];
    case 'ADMIN':
      return [
        { to: '/admin', label: 'Dashboard', end: true },
        { to: '/admin/applications', label: 'Applications' },
        { to: '/admin/properties', label: 'Properties' },
      ];
  }
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-navy-700 text-white' : 'text-cream-300 hover:text-white hover:bg-navy-700/60'
  }`;

function Logo({ to }: { to: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 group shrink-0">
      <div className="w-8 h-8 bg-gold-500 rounded-md flex items-center justify-center">
        <span className="text-white font-display font-bold text-sm">P</span>
      </div>
      <span className="font-display font-semibold text-cream-100 text-lg tracking-wide">The Plinth</span>
    </Link>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const favorites = useFavorites();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Signed-out visitors browsing public property pages still get a header
  if (!user) {
    return (
      <header className="bg-navy-800 shadow-nav sticky top-0 z-50">
        <div className="page-container flex items-center justify-between h-16">
          <Logo to="/properties" />
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-secondary text-cream-300 border-navy-600 hover:bg-navy-700 text-xs px-3 py-1.5">
              Log in
            </Link>
            <Link to="/signup" className="btn-gold text-xs px-3 py-1.5">Sign up</Link>
          </div>
        </div>
      </header>
    );
  }

  const items = getNavItems(user.role);
  const profilePath = getProfilePath(user.role);
  // Partners who still have to set a password can't use the rest of the app yet
  const locked = (user.role === 'BUILDER' || user.role === 'DSA') && user.mustChangePassword;

  return (
    <header className="bg-navy-800 shadow-nav sticky top-0 z-50">
      <div className="page-container">
        <div className="flex items-center justify-between h-16 gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Logo to={getDashboardPath(user.role)} />
            {!locked && (
              <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.end} className={linkClass}>
                    {i.label}
                    {i.to === '/saved' && favorites.count > 0 && (
                      <span className="ml-1.5 text-[10px] bg-gold-500 text-white rounded-full px-1.5 py-0.5">{favorites.count}</span>
                    )}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user.role === 'ADMIN' && <span className={roleBadgeStyle[user.role]}>{roleLabel[user.role]}</span>}
            {!locked && <NotificationBell />}
            <span className="text-cream-300 text-sm font-medium">{user.name}</span>
            {profilePath && !locked && (
              <Link to={profilePath} className="btn-secondary text-cream-300 border-navy-600 hover:bg-navy-700 text-xs px-3 py-1.5">
                Profile
              </Link>
            )}
            <button onClick={handleLogout} className="btn-secondary text-cream-300 border-navy-600 hover:bg-navy-700 text-xs px-3 py-1.5">
              Log out
            </button>
          </div>

          <div className="md:hidden flex items-center gap-1">
            {!locked && <NotificationBell />}
            <button
              className="text-cream-200 p-2 rounded focus:outline-none focus:ring-2 focus:ring-gold-400"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <div className="space-y-1">
                <span className={`block w-6 h-0.5 bg-cream-200 transition-all ${menuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
                <span className={`block w-6 h-0.5 bg-cream-200 transition-all ${menuOpen ? 'opacity-0' : ''}`} />
                <span className={`block w-6 h-0.5 bg-cream-200 transition-all ${menuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
              </div>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden pb-4 border-t border-navy-700 pt-3 space-y-1">
            <div className="flex items-center gap-3 pb-2">
              {user.role === 'ADMIN' && <span className={roleBadgeStyle[user.role]}>{roleLabel[user.role]}</span>}
              <span className="text-cream-300 text-sm font-medium">{user.name}</span>
            </div>
            {!locked && items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `block py-2 text-sm transition-colors ${isActive ? 'text-gold-400 font-semibold' : 'text-cream-300 hover:text-gold-400'}`
                }
              >
                {i.label}
              </NavLink>
            ))}
            {profilePath && !locked && (
              <Link to={profilePath} onClick={() => setMenuOpen(false)} className="block text-cream-300 text-sm py-2 hover:text-gold-400 transition-colors">
                My Profile
              </Link>
            )}
            <button onClick={handleLogout} className="w-full text-left text-cream-300 text-sm py-2 hover:text-gold-400 transition-colors">
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function getProfilePath(role: UserRole): string | null {
  switch (role) {
    case 'CUSTOMER': return '/customer/profile';
    case 'BUILDER':  return '/builder/profile';
    case 'DSA':      return '/dsa/profile';
    default:         return null;
  }
}

function getDashboardPath(role: UserRole): string {
  switch (role) {
    case 'CUSTOMER': return '/home';
    case 'BUILDER':  return '/builder';
    case 'ADMIN':    return '/admin';
    case 'DSA':      return '/dsa';
  }
}
