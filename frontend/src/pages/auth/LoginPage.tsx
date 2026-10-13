import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { loginApi } from '../../api/auth.api';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import AlertMessage from '../../components/ui/AlertMessage';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import type { UserRole } from '../../types';

function getRoleDashboard(role: UserRole): string {
  switch (role) {
    case 'CUSTOMER': return '/home';
    case 'BUILDER':  return '/builder';
    case 'ADMIN':    return '/admin';
    case 'DSA':      return '/dsa';
  }
}

export default function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]       = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setIsLoading(true);

    try {
      const user = await loginApi({ email, password });
      setUser(user);

      // Redirect: if partner must change password, always direct to change password
      let destination: string;
      if (user.role === 'BUILDER' && user.mustChangePassword) {
        destination = '/builder/change-password';
      } else if (user.role === 'DSA' && user.mustChangePassword) {
        destination = '/dsa/change-password';
      } else {
        destination = from || getRoleDashboard(user.role);
      }
      navigate(destination, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setFieldErrors(getFieldErrors(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-navy-800 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gold-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-display font-bold text-lg">P</span>
          </div>
          <span className="font-display font-semibold text-cream-100 text-xl tracking-wide">
            The Plinth
          </span>
        </div>

        <div className="space-y-6">
          <h1 className="font-display text-4xl font-semibold text-cream-100 leading-snug">
            Ahmedabad's Premier<br />Real Estate Intelligence<br />Platform
          </h1>
          <p className="text-navy-300 text-lg leading-relaxed">
            Discover properties with confidence. Trusted data, verified builders, intelligent insights.
          </p>
          <div className="flex gap-8 pt-4">
            <Stat value="500+" label="Properties" />
            <Stat value="120+" label="Verified Builders" />
            <Stat value="19+" label="Localities" />
          </div>
        </div>

        <p className="text-navy-400 text-sm">
          © {new Date().getFullYear()} The Plinth. All rights reserved.
        </p>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-cream-100">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-gold-500 rounded-md flex items-center justify-center">
              <span className="text-white font-display font-bold text-sm">P</span>
            </div>
            <span className="font-display font-semibold text-navy-800 text-lg">The Plinth</span>
          </div>

          <div className="mb-8">
            <h2 className="font-display text-3xl font-semibold text-navy-900">Welcome back</h2>
            <p className="text-navy-500 mt-1 text-sm">
              Sign in to your account to continue.
            </p>
          </div>

          {error && <AlertMessage type="error" message={error} className="mb-6" />}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`input ${fieldErrors.email ? 'input-error' : ''}`}
                placeholder="you@example.com"
                required
                disabled={isLoading}
              />
              {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`input pr-12 ${fieldErrors.password ? 'input-error' : ''}`}
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600 text-xs"
                  tabIndex={-1}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="btn-primary btn-lg w-full mt-2"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Signing in…</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-navy-500 mt-8">
            New customer?{' '}
            <Link to="/signup" className="text-navy-700 font-medium hover:text-gold-600 underline-offset-2 hover:underline">
              Create an account
            </Link>
          </p>

          <div className="mt-4 pt-4 border-t border-navy-100 space-y-1">
            <p className="text-center text-xs text-navy-500 font-medium">Partner applications</p>
            <div className="flex justify-center gap-4 text-xs">
              <Link
                to="/apply/builder"
                className="text-navy-500 hover:text-gold-600 underline-offset-2 hover:underline"
              >
                Apply as Builder
              </Link>
              <span className="text-navy-300">|</span>
              <Link
                to="/apply/dsa"
                className="text-navy-500 hover:text-gold-600 underline-offset-2 hover:underline"
              >
                Apply as DSA Partner
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-semibold text-gold-400">{value}</div>
      <div className="text-navy-400 text-sm">{label}</div>
    </div>
  );
}
