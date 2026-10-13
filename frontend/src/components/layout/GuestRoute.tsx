import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import PageLoader from '../ui/PageLoader';
import type { UserRole } from '../../types';

interface Props {
  children: React.ReactNode;
}

/**
 * Route only accessible when NOT authenticated.
 * Redirects logged-in users to their role dashboard.
 */
export default function GuestRoute({ children }: Props) {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <PageLoader />;

  if (isAuthenticated && user) {
    if (user.role === 'BUILDER' && user.mustChangePassword) {
      return <Navigate to="/builder/change-password" replace />;
    }
    if (user.role === 'DSA' && user.mustChangePassword) {
      return <Navigate to="/dsa/change-password" replace />;
    }
    return <Navigate to={getRoleDashboard(user.role)} replace />;
  }

  return <>{children}</>;
}

function getRoleDashboard(role: UserRole): string {
  switch (role) {
    case 'CUSTOMER': return '/home';
    case 'BUILDER':  return '/builder';
    case 'ADMIN':    return '/admin';
    case 'DSA':      return '/dsa';
    default:         return '/login';
  }
}
