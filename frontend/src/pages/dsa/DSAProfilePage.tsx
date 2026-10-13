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
import type { User, DSAProfileData } from '../../types';

export default function DSAProfilePage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [dsaData, setDsaData] = useState<DSAProfileData | null>(null);
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
      if (data.dsaProfile) {
        setDsaData(data.dsaProfile);
      }
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
      setFieldErrors({});
      setError('');
      setIsEditing(false);
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccess('');
    setFieldErrors({});

    try {
      const updated = await updateProfileApi({
        name: name.trim(),
        phone: phone.trim() || undefined,
      });

      setProfileUser(updated.user);
      if (updated.dsaProfile) {
        setDsaData(updated.dsaProfile);
      }
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
              onClick={() => navigate('/dsa')}
              className="text-navy-500 hover:text-navy-800 text-sm transition-colors"
            >
              ← Dashboard
            </button>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-navy-900">
              DSA Profile
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
                <div className="w-16 h-16 rounded-2xl bg-teal-800 text-cream-100 font-display font-semibold text-2xl flex items-center justify-center shadow-sm">
                  {dsaData?.firmName
                    ? dsaData.firmName.charAt(0).toUpperCase()
                    : profileUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-display text-xl font-semibold text-navy-900">
                    {dsaData?.firmName || profileUser.name}
                  </h2>
                  <p className="text-sm text-navy-500">
                    {dsaData?.firmName ? `Partner: ${profileUser.name}` : profileUser.email}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="badge bg-teal-100 text-teal-800">DSA Partner</span>
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
                    Personal & Contact Details
                  </h3>
                  <p className="text-xs text-navy-500">
                    {isEditing
                      ? 'Update your personal contact details below.'
                      : 'Your personal and verified contact information.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Full Name */}
                  <div>
                    <label htmlFor="dsa-name" className="label text-xs">
                      Full Name {isEditing && <span className="text-red-500">*</span>}
                    </label>
                    {isEditing ? (
                      <div>
                        <input
                          id="dsa-name"
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
                    <label htmlFor="dsa-email" className="label text-xs">
                      Email Address <span className="text-navy-400 font-normal">(Non-editable)</span>
                    </label>
                    <p
                      id="dsa-email"
                      className="text-sm font-medium text-navy-600 bg-cream-100 px-3.5 py-2.5 rounded-lg border border-navy-200 cursor-not-allowed"
                    >
                      {profileUser.email}
                    </p>
                  </div>

                  {/* Mobile Number */}
                  <div className="sm:col-span-2">
                    <label htmlFor="dsa-phone" className="label text-xs">
                      Mobile Number
                    </label>
                    {isEditing ? (
                      <div>
                        <input
                          id="dsa-phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className={`input max-w-md ${fieldErrors.phone ? 'input-error' : ''}`}
                          placeholder="10-digit mobile number"
                          disabled={isSaving}
                        />
                        {fieldErrors.phone && (
                          <p className="field-error">{fieldErrors.phone}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-navy-800 bg-cream-50 px-3.5 py-2.5 rounded-lg border border-navy-100 max-w-md">
                        {profileUser.phone || 'Not provided'}
                      </p>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="flex items-center gap-3 pt-4 border-t border-navy-100">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="btn-primary text-xs px-5 py-2.5 flex items-center gap-2"
                    >
                      {isSaving && <LoadingSpinner size="sm" />}
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="btn-secondary text-xs px-4 py-2.5"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </form>

            {/* Partnership Details (Verified / Application Data) */}
            {dsaData && (
              <div className="card px-6 py-6 sm:px-8 sm:py-8 space-y-6">
                <div>
                  <h3 className="font-display text-lg font-semibold text-navy-900 mb-1">
                    Partnership Details
                  </h3>
                  <p className="text-xs text-navy-500">
                    Registered partner information submitted during onboarding.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {dsaData.firmName && (
                    <div>
                      <span className="label text-xs">Firm / Organisation</span>
                      <p className="text-sm font-medium text-navy-800 bg-cream-50 px-3.5 py-2.5 rounded-lg border border-navy-100">
                        {dsaData.firmName}
                      </p>
                    </div>
                  )}

                  <div>
                    <span className="label text-xs">Employment Type</span>
                    <p className="text-sm font-medium text-navy-800 bg-cream-50 px-3.5 py-2.5 rounded-lg border border-navy-100">
                      {dsaData.employmentType}
                    </p>
                  </div>

                  <div>
                    <span className="label text-xs">Years of Experience</span>
                    <p className="text-sm font-medium text-navy-800 bg-cream-50 px-3.5 py-2.5 rounded-lg border border-navy-100">
                      {dsaData.yearsOfExperience} years
                    </p>
                  </div>

                  {dsaData.currentOrganization && (
                    <div>
                      <span className="label text-xs">Current Organisation</span>
                      <p className="text-sm font-medium text-navy-800 bg-cream-50 px-3.5 py-2.5 rounded-lg border border-navy-100">
                        {dsaData.currentOrganization}
                      </p>
                    </div>
                  )}

                  {dsaData.bankPartnerships && (
                    <div className="sm:col-span-2">
                      <span className="label text-xs">Bank / NBFC Partnerships</span>
                      <p className="text-sm font-medium text-navy-800 bg-cream-50 px-3.5 py-2.5 rounded-lg border border-navy-100">
                        {dsaData.bankPartnerships}
                      </p>
                    </div>
                  )}

                  {dsaData.areasOfOperation && dsaData.areasOfOperation.length > 0 && (
                    <div className="sm:col-span-2">
                      <span className="label text-xs">Areas of Operation</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {dsaData.areasOfOperation.map((area) => (
                          <span
                            key={area}
                            className="bg-navy-100 text-navy-800 text-xs px-2.5 py-1 rounded-md"
                          >
                            {area}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="sm:col-span-2">
                    <span className="label text-xs">Registered Address</span>
                    <p className="text-sm font-medium text-navy-800 bg-cream-50 px-3.5 py-2.5 rounded-lg border border-navy-100">
                      {dsaData.address}, {dsaData.city}, {dsaData.state}
                    </p>
                  </div>

                  {dsaData.description && (
                    <div className="sm:col-span-2">
                      <span className="label text-xs">Professional Profile</span>
                      <p className="text-sm text-navy-700 bg-cream-50 px-3.5 py-2.5 rounded-lg border border-navy-100 whitespace-pre-line">
                        {dsaData.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </main>

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={() => {
          setSuccess('Password changed successfully.');
        }}
      />
    </div>
  );
}
