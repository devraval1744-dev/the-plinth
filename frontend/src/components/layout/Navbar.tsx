import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <header className="bg-navy-800 shadow-nav sticky top-0 z-50">
      <div className="page-container">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to={getDashboardPath(user.role)}
            className="flex items-center gap-2 group"
          >
            <div className="w-8 h-8 bg-gold-500 rounded-md flex items-center justify-center">
              <span className="text-white font-display font-bold text-sm">P</span>
            </div>
            <span className="font-display font-semibold text-cream-100 text-lg tracking-wide">
              The Plinth
            </span>
          </Link>

          {/* Desktop right: [Role Badge] (if applicable) [User Name] [Profile] [Log out] */}
          <div className="hidden md:flex items-center gap-3">
            {user.role !== 'CUSTOMER' && user.role !== 'BUILDER' && user.role !== 'DSA' && (
              <span className={roleBadgeStyle[user.role]}>{roleLabel[user.role]}</span>
            )}
            <span className="text-cream-300 text-sm font-medium">{user.name}</span>
            {getProfilePath(user.role) && (
              <Link
                to={getProfilePath(user.role)!}
                className="btn-secondary text-cream-300 border-navy-600 hover:bg-navy-700 text-xs px-3 py-1.5"
              >
                Profile
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="btn-secondary text-cream-300 border-navy-600 hover:bg-navy-700 text-xs px-3 py-1.5"
            >
              Log out
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-cream-200 p-2 rounded focus:outline-none focus:ring-2 focus:ring-gold-400"
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

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden pb-4 border-t border-navy-700 pt-3 space-y-3">
            <div className="flex items-center gap-3">
              {user.role !== 'CUSTOMER' && user.role !== 'BUILDER' && user.role !== 'DSA' && (
                <span className={roleBadgeStyle[user.role]}>{roleLabel[user.role]}</span>
              )}
              <span className="text-cream-300 text-sm font-medium">{user.name}</span>
            </div>
            {getProfilePath(user.role) && (
              <Link
                to={getProfilePath(user.role)!}
                onClick={() => setMenuOpen(false)}
                className="block text-cream-300 text-sm py-2 hover:text-gold-400 transition-colors"
              >
                My Profile
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="w-full text-left text-cream-300 text-sm py-2 hover:text-gold-400 transition-colors"
            >
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
