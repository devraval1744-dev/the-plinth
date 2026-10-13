import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import AlertMessage from '../../components/ui/AlertMessage';
import ChangePasswordModal from '../../components/profile/ChangePasswordModal';
import { getProfileApi, updateProfileApi } from '../../api/user.api';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import { formatDate } from '../../utils/format';
import type { User } from '../../types';

export default function CustomerProfilePage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // Password Modal
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const fetchProfile = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getProfileApi();
      setProfileUser(data.user);
      setName(data.user.name || '');
      setPhone(data.user.phone || '');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleStartEdit = () => {
    if (profileUser) {
      setName(profileUser.name || '');
      setPhone(profileUser.phone || '');
      setFieldErrors({});
      setError('');
      setSuccess('');
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    if (profileUser) {
      setName(profileUser.name || '');
      setPhone(profileUser.phone || '');
    }
    setFieldErrors({});
    setError('');
    setIsEditing(false);
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setFieldErrors({});

    // Client-side validation
    if (!name.trim()) {
      setFieldErrors((prev) => ({ ...prev, name: 'Full name is required' }));
      return;
    }
    if (phone.trim() && !/^[6-9]\d{9}$/.test(phone.trim())) {
      setFieldErrors((prev) => ({
        ...prev,
        phone: 'Please provide a valid 10-digit Indian mobile number',
      }));
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateProfileApi({
        name: name.trim(),
        phone: phone.trim() || undefined,
      });
      setProfileUser(updated.user);
      setName(updated.user.name);
      setPhone(updated.user.phone || '');
      setSuccess('Profile updated successfully.');
      setIsEditing(false);
      await refreshUser();
    } catch (err) {
      setError(getErrorMessage(err));
      setFieldErrors(getFieldErrors(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />

      <main className="page-container py-8 space-y-6">
        {/* Navigation & Title */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/home')}
              className="text-navy-500 hover:text-navy-800 text-sm transition-colors"
            >
              ← Dashboard
            </button>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-navy-900">
              Customer Profile
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {!isEditing && (
              <>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  disabled={isLoading}
                  className="btn btn-secondary text-xs px-4 py-2"
                >
                  Edit Profile
                </button>
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(true)}
                  disabled={isLoading}
                  className="btn-primary text-xs px-4 py-2"
                >
                  Change Password
                </button>
              </>
            )}
          </div>
        </div>

        {error && <AlertMessage type="error" message={error} />}
        {success && <AlertMessage type="success" message={success} />}

        {isLoading ? (
          <div className="card py-20 flex justify-center items-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : profileUser ? (
          <div className="space-y-6">
            {/* Top Identity Card */}
            <div className="card px-6 py-6 sm:px-8 sm:py-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-navy-800 text-cream-100 font-display font-semibold text-2xl flex items-center justify-center shadow-sm">
                  {profileUser.name ? profileUser.name.charAt(0).toUpperCase() : 'C'}
                </div>
                <div>
                  <h2 className="font-display text-xl font-semibold text-navy-900">
                    {profileUser.name}
                  </h2>
                  <p className="text-sm text-navy-500">{profileUser.email}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="badge-navy">Customer</span>
                    <span
                      className={`badge ${
                        profileUser.accountStatus === 'ACTIVE'
                          ? 'badge-success'
                          : 'badge-warning'
                      }`}
                    >
                      {profileUser.accountStatus}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-left sm:text-right border-t sm:border-t-0 pt-4 sm:pt-0 w-full sm:w-auto">
                <span className="text-xs text-navy-400 uppercase tracking-wider block">
                  Member Since
                </span>
                <span className="text-sm font-medium text-navy-800">
                  {formatDate(profileUser.createdAt)}
                </span>
              </div>
            </div>

            {/* Profile Form / View */}
            <form onSubmit={handleSaveProfile} noValidate>
              <div className="card px-6 py-6 sm:px-8 sm:py-8 space-y-6">
                <div>
                  <h3 className="font-display text-lg font-semibold text-navy-900 mb-1">
                    Personal Information
                  </h3>
                  <p className="text-xs text-navy-500">
                    {isEditing
                      ? 'Update your personal details below.'
                      : 'Your verified personal and contact details.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Full Name */}
                  <div>
                    <label htmlFor="customer-name" className="label text-xs">
                      Full Name {isEditing && <span className="text-red-500">*</span>}
                    </label>
                    {isEditing ? (
                      <div>
                        <input
                          id="customer-name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className={`input ${fieldErrors.name ? 'input-error' : ''}`}
                          placeholder="Your full name"
                          disabled={isSaving}
                        />
                        {fieldErrors.name && (
                          <p className="field-error">{fieldErrors.name}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-navy-800 bg-cream-50 px-3.5 py-2.5 rounded-lg border border-navy-100">
                        {profileUser.name}
                      </p>
                    )}
                  </div>

                  {/* Email (Read-only) */}
                  <div>
                    <label htmlFor="customer-email" className="label text-xs">
                      Email Address <span className="text-navy-400 font-normal">(Primary / Non-editable)</span>
                    </label>
                    <p
                      id="customer-email"
                      className="text-sm font-medium text-navy-600 bg-cream-100 px-3.5 py-2.5 rounded-lg border border-navy-200 cursor-not-allowed"
                    >
                      {profileUser.email}
                    </p>
                  </div>

                  {/* Phone */}
                  <div>
                    <label htmlFor="customer-phone" className="label text-xs">
                      Mobile Number
                    </label>
                    {isEditing ? (
                      <div>
                        <input
                          id="customer-phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className={`input ${fieldErrors.phone ? 'input-error' : ''}`}
                          placeholder="10-digit mobile number"
                          disabled={isSaving}
                        />
                        {fieldErrors.phone && (
                          <p className="field-error">{fieldErrors.phone}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-navy-800 bg-cream-50 px-3.5 py-2.5 rounded-lg border border-navy-100">
                        {profileUser.phone || '— Not provided —'}
                      </p>
                    )}
                  </div>

                  {/* Account Role (Read-only) */}
                  <div>
                    <label htmlFor="customer-role" className="label text-xs">
                      Account Role <span className="text-navy-400 font-normal">(Non-editable)</span>
                    </label>
                    <p
                      id="customer-role"
                      className="text-sm font-medium text-navy-600 bg-cream-100 px-3.5 py-2.5 rounded-lg border border-navy-200 cursor-not-allowed"
                    >
                      {profileUser.role}
                    </p>
                  </div>
                </div>

                {/* Edit Mode Buttons */}
                {isEditing && (
                  <div className="pt-4 border-t border-navy-100 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="btn btn-secondary text-xs px-4 py-2"
                    >
                      Cancel Changes
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="btn-primary text-xs px-5 py-2 flex items-center gap-1.5"
                    >
                      {isSaving ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span>Saving…</span>
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  </div>
                )}
              </div>
            </form>
          </div>
        ) : null}
      </main>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={() => setSuccess('Password changed successfully.')}
      />
    </div>
  );
}
