import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import PageLoader from '../ui/PageLoader';
import type { UserRole } from '../../types';

interface Props {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  allowPasswordChangeOnly?: boolean;
}

/**
 * Wraps a route that requires authentication.
 * Optionally restricts access to specific roles.
 * Handles Builder password change enforcement.
 */
export default function ProtectedRoute({
  children,
  allowedRoles,
  allowPasswordChangeOnly = false,
}: Props) {
  const { user, isLoading, isAuthenticated, mustChangePassword } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated || !user) {
    // Redirect to login, preserve intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Authenticated but wrong role — send to their own dashboard or change-password
    if (user.role === 'BUILDER' && user.mustChangePassword) {
      return <Navigate to="/builder/change-password" replace />;
    }
    if (user.role === 'DSA' && user.mustChangePassword) {
      return <Navigate to="/dsa/change-password" replace />;
    }
    return <Navigate to={getRoleDashboard(user.role)} replace />;
  }

  // Partner password change flow enforcement
  if (mustChangePassword) {
    // If user must change password, they can ONLY visit routes with allowPasswordChangeOnly=true
    if (!allowPasswordChangeOnly) {
      const changePassPath = user.role === 'DSA' ? '/dsa/change-password' : '/builder/change-password';
      return <Navigate to={changePassPath} replace />;
    }
  } else {
    // If user completed password change (or is not required), they cannot visit change-password page
    if (allowPasswordChangeOnly) {
      return <Navigate to={getRoleDashboard(user.role)} replace />;
    }
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
