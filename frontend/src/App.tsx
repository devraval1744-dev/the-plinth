import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import GuestRoute from './components/layout/GuestRoute';
import PageLoader from './components/ui/PageLoader';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';

// Apply pages (public)
import BuilderApplyPage from './pages/apply/BuilderApplyPage';
import DSAApplyPage from './pages/apply/DSAApplyPage';

// Public property pages
import PropertyDiscoveryPage from './pages/properties/PropertyDiscoveryPage';
import PropertyDetailPage from './pages/properties/PropertyDetailPage';

// Role dashboards
import CustomerHome from './pages/customer/CustomerHome';
import BuilderDashboard from './pages/builder/BuilderDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';
import DSADashboard from './pages/dsa/DSADashboard';

// Admin sub-pages
import ApplicationsPage from './pages/admin/applications/ApplicationsPage';
import AdminPropertiesPage from './pages/admin/properties/AdminPropertiesPage';

// Profile pages
import CustomerProfilePage from './pages/customer/CustomerProfilePage';
import BuilderProfilePage from './pages/builder/BuilderProfilePage';
import DSAProfilePage from './pages/dsa/DSAProfilePage';

// Builder sub-pages
import BuilderPropertiesPage from './pages/builder/properties/BuilderPropertiesPage';
import PropertyFormPage from './pages/builder/properties/PropertyFormPage';
import BlueprintManagementPage from './pages/builder/blueprints/BlueprintManagementPage';
import BuilderChangePasswordPage from './pages/builder/auth/BuilderChangePasswordPage';
import DSAChangePasswordPage from './pages/dsa/auth/DSAChangePasswordPage';

export default function App() {
  const { isLoading, user } = useAuth();

  if (isLoading) return <PageLoader />;

  return (
    <Routes>
      {/* ── Public / Guest only ────────────────────────────── */}
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/signup" element={<GuestRoute><SignupPage /></GuestRoute>} />

      {/* ── Partner application pages (public) ───────────── */}
      <Route path="/apply/builder" element={<BuilderApplyPage />} />
      <Route path="/apply/dsa" element={<DSAApplyPage />} />

      {/* ── Public property discovery (no auth required) ──── */}
      <Route path="/properties" element={<PropertyDiscoveryPage />} />
      <Route path="/properties/:id" element={<PropertyDetailPage />} />

      {/* ── Customer ──────────────────────────────────────── */}
      <Route path="/home" element={
        <ProtectedRoute allowedRoles={['CUSTOMER']}><CustomerHome /></ProtectedRoute>
      } />
      <Route path="/customer/profile" element={
        <ProtectedRoute allowedRoles={['CUSTOMER']}><CustomerProfilePage /></ProtectedRoute>
      } />

      {/* ── Builder ───────────────────────────────────────── */}
      <Route path="/builder/change-password" element={
        <ProtectedRoute allowedRoles={['BUILDER']} allowPasswordChangeOnly={true}>
          <BuilderChangePasswordPage />
        </ProtectedRoute>
      } />
      <Route path="/builder" element={
        <ProtectedRoute allowedRoles={['BUILDER']}><BuilderDashboard /></ProtectedRoute>
      } />
      <Route path="/builder/profile" element={
        <ProtectedRoute allowedRoles={['BUILDER']}><BuilderProfilePage /></ProtectedRoute>
      } />
      <Route path="/builder/properties" element={
        <ProtectedRoute allowedRoles={['BUILDER']}><BuilderPropertiesPage /></ProtectedRoute>
      } />
      <Route path="/builder/properties/new" element={
        <ProtectedRoute allowedRoles={['BUILDER']}><PropertyFormPage /></ProtectedRoute>
      } />
      <Route path="/builder/properties/:id/edit" element={
        <ProtectedRoute allowedRoles={['BUILDER']}><PropertyFormPage /></ProtectedRoute>
      } />
      <Route path="/builder/properties/:propertyId/blueprints" element={
        <ProtectedRoute allowedRoles={['BUILDER']}><BlueprintManagementPage /></ProtectedRoute>
      } />

      {/* ── Admin ─────────────────────────────────────────── */}
      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard /></ProtectedRoute>
      } />
      <Route path="/admin/applications" element={
        <ProtectedRoute allowedRoles={['ADMIN']}><ApplicationsPage /></ProtectedRoute>
      } />
      <Route path="/admin/properties" element={
        <ProtectedRoute allowedRoles={['ADMIN']}><AdminPropertiesPage /></ProtectedRoute>
      } />

      {/* ── DSA ───────────────────────────────────────────── */}
      <Route path="/dsa/change-password" element={
        <ProtectedRoute allowedRoles={['DSA']} allowPasswordChangeOnly={true}>
          <DSAChangePasswordPage />
        </ProtectedRoute>
      } />
      <Route path="/dsa" element={
        <ProtectedRoute allowedRoles={['DSA']}><DSADashboard /></ProtectedRoute>
      } />
      <Route path="/dsa/profile" element={
        <ProtectedRoute allowedRoles={['DSA']}><DSAProfilePage /></ProtectedRoute>
      } />
      <Route path="/dsa/*" element={
        <ProtectedRoute allowedRoles={['DSA']}><DSADashboard /></ProtectedRoute>
      } />

      {/* ── Root redirect ─────────────────────────────────── */}
      <Route path="/" element={
        user ? (
          user.role === 'BUILDER' && user.mustChangePassword ? (
            <Navigate to="/builder/change-password" replace />
          ) : user.role === 'DSA' && user.mustChangePassword ? (
            <Navigate to="/dsa/change-password" replace />
          ) : (
            <Navigate to={getRoleDashboard(user.role)} replace />
          )
        ) : (
          <Navigate to="/login" replace />
        )
      } />

      {/* ── 404 ───────────────────────────────────────────── */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function getRoleDashboard(role: string) {
  switch (role) {
    case 'CUSTOMER': return '/home';
    case 'BUILDER':  return '/builder';
    case 'ADMIN':    return '/admin';
    case 'DSA':      return '/dsa';
    default:         return '/login';
  }
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-200">
      <div className="text-center space-y-4">
        <h1 className="font-display text-6xl font-semibold text-navy-800">404</h1>
        <p className="text-navy-500">Page not found.</p>
        <a href="/" className="btn-primary btn inline-flex">Go Home</a>
      </div>
    </div>
  );
}
