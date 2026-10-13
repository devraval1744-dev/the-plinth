import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePasswordApi } from '../../../api/auth.api';
import { useAuth } from '../../../context/AuthContext';
import { getErrorMessage, getFieldErrors } from '../../../api/client';
import AlertMessage from '../../../components/ui/AlertMessage';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

export default function DSAChangePasswordPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Client-side password policy checks for feedback
  const meetsMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setFieldErrors({});

    // Client-side validation
    if (!currentPassword) {
      setFieldErrors((prev) => ({ ...prev, currentPassword: 'Current / temporary password is required' }));
      return;
    }

    if (!newPassword) {
      setFieldErrors((prev) => ({ ...prev, newPassword: 'New password is required' }));
      return;
    }

    if (!meetsMinLength || !hasUppercase || !hasLowercase || !hasNumber) {
      setError('Password must meet all requirement criteria.');
      return;
    }

    if (newPassword === currentPassword) {
      setError('New password must be different from your temporary password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmPassword: 'Passwords do not match' }));
      return;
    }

    setIsLoading(true);

    try {
      await changePasswordApi({ currentPassword, newPassword });
      setSuccess('Password updated successfully.');
      await refreshUser();

      // Short delay for user to register the success alert before transitioning
      setTimeout(() => {
        navigate('/dsa', { replace: true });
      }, 1000);
    } catch (err) {
      setError(getErrorMessage(err));
      setFieldErrors(getFieldErrors(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-cream-200 flex flex-col justify-between">
      {/* Top minimal header */}
      <header className="bg-navy-800 shadow-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gold-500 rounded-md flex items-center justify-center">
              <span className="text-white font-display font-bold text-sm">P</span>
            </div>
            <span className="font-display font-semibold text-cream-100 text-lg tracking-wide">
              The Plinth
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="btn-secondary text-cream-300 border-navy-600 hover:bg-navy-700 text-xs px-3 py-1.5"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Main card */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-card border border-navy-100 p-8 sm:p-10">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center mx-auto mb-4 border border-amber-200 text-amber-600 text-xl">
              🔒
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-navy-900">
              Set Your New Password
            </h1>
            <p className="text-navy-600 text-sm mt-2 leading-relaxed">
              Your password must be changed before you can continue.
            </p>
            {user?.name && (
              <p className="text-xs text-navy-400 mt-1">
                Logged in as <strong>{user.name}</strong> ({user.email})
              </p>
            )}
          </div>

          {error && <AlertMessage type="error" message={error} className="mb-6" />}
          {success && <AlertMessage type="success" message={success} className="mb-6" />}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Current / Temporary Password */}
            <div>
              <label htmlFor="currentPassword" className="label">
                Current / Temporary Password
              </label>
              <div className="relative">
                <input
                  id="currentPassword"
                  type={showCurrentPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={`input pr-12 ${fieldErrors.currentPassword ? 'input-error' : ''}`}
                  placeholder="Enter temporary password"
                  required
                  disabled={isLoading || !!success}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600 text-xs"
                  tabIndex={-1}
                  aria-label={showCurrentPass ? 'Hide password' : 'Show password'}
                >
                  {showCurrentPass ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.currentPassword && (
                <p className="form-error">{fieldErrors.currentPassword}</p>
              )}
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="newPassword" className="label">
                New Password
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type={showNewPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`input pr-12 ${fieldErrors.newPassword ? 'input-error' : ''}`}
                  placeholder="Minimum 8 characters"
                  required
                  disabled={isLoading || !!success}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600 text-xs"
                  tabIndex={-1}
                  aria-label={showNewPass ? 'Hide password' : 'Show password'}
                >
                  {showNewPass ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.newPassword && (
                <p className="form-error">{fieldErrors.newPassword}</p>
              )}

              {/* Password criteria indicators */}
              <div className="mt-2.5 p-3 bg-cream-100 rounded-lg space-y-1.5 text-xs">
                <p className="font-semibold text-navy-700 mb-1">Password requirements:</p>
                <div className="grid grid-cols-2 gap-1.5 text-navy-600">
                  <div className={`flex items-center gap-1.5 ${meetsMinLength ? 'text-green-600 font-medium' : ''}`}>
                    <span>{meetsMinLength ? '✓' : '○'}</span>
                    <span>At least 8 characters</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasUppercase ? 'text-green-600 font-medium' : ''}`}>
                    <span>{hasUppercase ? '✓' : '○'}</span>
                    <span>One uppercase letter</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasLowercase ? 'text-green-600 font-medium' : ''}`}>
                    <span>{hasLowercase ? '✓' : '○'}</span>
                    <span>One lowercase letter</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-green-600 font-medium' : ''}`}>
                    <span>{hasNumber ? '✓' : '○'}</span>
                    <span>One number (0–9)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label htmlFor="confirmPassword" className="label">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`input pr-12 ${fieldErrors.confirmPassword ? 'input-error' : ''}`}
                  placeholder="Re-enter your new password"
                  required
                  disabled={isLoading || !!success}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600 text-xs"
                  tabIndex={-1}
                  aria-label={showConfirmPass ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPass ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="form-error">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !!success}
              className="btn-primary btn w-full py-3 flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Updating Password…</span>
                </>
              ) : success ? (
                'Password Set Successfully'
              ) : (
                'Set Password & Continue'
              )}
            </button>
          </form>
        </div>
      </main>

      <footer className="text-center py-4 text-xs text-navy-400">
        © {new Date().getFullYear()} The Plinth. All rights reserved.
      </footer>
    </div>
  );
}
