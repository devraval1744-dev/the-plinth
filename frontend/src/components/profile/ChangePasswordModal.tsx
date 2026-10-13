import { useState, type FormEvent } from 'react';
import { changeUserPasswordApi } from '../../api/user.api';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import AlertMessage from '../ui/AlertMessage';
import LoadingSpinner from '../ui/LoadingSpinner';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
  onSuccess,
}: ChangePasswordModalProps) {
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

  if (!isOpen) return null;

  // Real-time policy criteria
  const meetsMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setFieldErrors({});

    if (!currentPassword) {
      setFieldErrors((prev) => ({ ...prev, currentPassword: 'Current password is required' }));
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
      setError('New password must be different from current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmPassword: 'Passwords do not match' }));
      return;
    }

    setIsLoading(true);

    try {
      await changeUserPasswordApi({ currentPassword, newPassword });
      setSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
        setSuccess('');
      }, 1200);
    } catch (err) {
      setError(getErrorMessage(err));
      setFieldErrors(getFieldErrors(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleModalClose = () => {
    if (!isLoading) {
      setError('');
      setSuccess('');
      setFieldErrors({});
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleModalClose()}
    >
      <div className="bg-white rounded-2xl shadow-card-hover w-full max-w-md overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-navy-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔒</span>
            <h2 className="font-display text-lg font-semibold text-navy-900">
              Change Password
            </h2>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            className="text-navy-400 hover:text-navy-700 text-lg p-1"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {error && <AlertMessage type="error" message={error} />}
          {success && <AlertMessage type="success" message={success} />}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Current Password */}
            <div>
              <label htmlFor="modal-currentPassword" className="label text-xs">
                Current Password
              </label>
              <div className="relative">
                <input
                  id="modal-currentPassword"
                  type={showCurrentPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={`input pr-12 text-sm ${fieldErrors.currentPassword ? 'input-error' : ''}`}
                  placeholder="Enter current password"
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
                <p className="field-error">{fieldErrors.currentPassword}</p>
              )}
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="modal-newPassword" className="label text-xs">
                New Password
              </label>
              <div className="relative">
                <input
                  id="modal-newPassword"
                  type={showNewPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`input pr-12 text-sm ${fieldErrors.newPassword ? 'input-error' : ''}`}
                  placeholder="Enter new password"
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
                <p className="field-error">{fieldErrors.newPassword}</p>
              )}

              {/* Password Requirements */}
              <div className="mt-2 p-2.5 bg-cream-50 rounded-lg border border-navy-100 text-xs text-navy-600 space-y-1">
                <div className="grid grid-cols-2 gap-1">
                  <div className={`flex items-center gap-1 ${meetsMinLength ? 'text-green-600 font-medium' : 'text-navy-400'}`}>
                    <span>{meetsMinLength ? '✓' : '○'}</span>
                    <span>Min 8 chars</span>
                  </div>
                  <div className={`flex items-center gap-1 ${hasUppercase ? 'text-green-600 font-medium' : 'text-navy-400'}`}>
                    <span>{hasUppercase ? '✓' : '○'}</span>
                    <span>1 uppercase</span>
                  </div>
                  <div className={`flex items-center gap-1 ${hasLowercase ? 'text-green-600 font-medium' : 'text-navy-400'}`}>
                    <span>{hasLowercase ? '✓' : '○'}</span>
                    <span>1 lowercase</span>
                  </div>
                  <div className={`flex items-center gap-1 ${hasNumber ? 'text-green-600 font-medium' : 'text-navy-400'}`}>
                    <span>{hasNumber ? '✓' : '○'}</span>
                    <span>1 number</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label htmlFor="modal-confirmPassword" className="label text-xs">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="modal-confirmPassword"
                  type={showConfirmPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`input pr-12 text-sm ${fieldErrors.confirmPassword ? 'input-error' : ''}`}
                  placeholder="Confirm new password"
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
                <p className="field-error">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleModalClose}
                disabled={isLoading}
                className="btn btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !currentPassword || !newPassword || !confirmPassword || !!success}
                className="btn-primary text-xs px-4 py-2"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Updating…</span>
                  </>
                ) : (
                  'Change Password'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
