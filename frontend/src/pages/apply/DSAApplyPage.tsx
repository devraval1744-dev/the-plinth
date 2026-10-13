import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { submitDSAApplicationApi } from '../../api/applications.api';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import AlertMessage from '../../components/ui/AlertMessage';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import type { DSAApplicationFormData } from '../../types';

const EMPLOYMENT_TYPES = ['Self-Employed', 'Employed', 'Freelance'];

const INITIAL: DSAApplicationFormData = {
  applicantName: '',
  email: '',
  phone: '',
  firmName: '',
  employmentType: '',
  yearsOfExperience: '',
  currentOrganization: '',
  areasOfOperation: '',
  bankPartnerships: '',
  address: '',
  city: '',
  state: '',
  description: '',
};

interface SuccessState {
  applicationId: string;
  email: string;
  submittedAt: string;
}

export default function DSAApplyPage() {
  const [form, setForm] = useState<DSAApplicationFormData>(INITIAL);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const set =
    (field: keyof DSAApplicationFormData) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (fieldErrors[field]) {
        setFieldErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
      }
    };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setIsLoading(true);
    try {
      const result = await submitDSAApplicationApi(form);
      setSuccess({ applicationId: result.applicationId, email: result.email, submittedAt: result.submittedAt });
    } catch (err) {
      setError(getErrorMessage(err));
      setFieldErrors(getFieldErrors(err));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-cream-200 flex items-center justify-center px-4 py-12">
        <div className="card max-w-lg w-full px-8 py-10 text-center space-y-5">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-3xl">✓</div>
          <h1 className="font-display text-2xl font-semibold text-navy-900">Application Submitted</h1>
          <p className="text-navy-600 text-sm leading-relaxed">
            Thank you for applying to The Plinth as a DSA Partner. Your application is{' '}
            <strong>pending admin review</strong>. We will contact you at{' '}
            <span className="font-medium text-navy-800">{success.email}</span> once a decision is made.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 text-left text-sm text-amber-800">
            <strong>Important reminder:</strong> As a DSA Partner you must not guarantee loan approval,
            interest rates, loan amounts, eligibility outcomes, or any other loan terms to customers.
          </div>
          <div className="bg-cream-100 rounded-lg px-5 py-4 text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-navy-500">Application ID</span>
              <span className="font-mono text-navy-700 text-xs">{success.applicationId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-navy-500">Status</span>
              <span className="badge-warning">Pending Review</span>
            </div>
            <div className="flex justify-between">
              <span className="text-navy-500">Submitted</span>
              <span className="text-navy-700">
                {new Date(success.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
          <p className="text-xs text-navy-400">
            Once approved, you will receive your login credentials and can access the DSA Dashboard via the common{' '}
            <Link to="/login" className="text-navy-600 underline">Login page</Link>.
          </p>
          <Link to="/" className="btn-primary btn inline-flex mt-2">Back to Home</Link>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-cream-200">
      <div className="bg-navy-800 py-10">
        <div className="page-container">
          <div className="flex items-center gap-3 mb-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gold-500 rounded-md flex items-center justify-center">
                <span className="text-white font-display font-bold text-sm">P</span>
              </div>
              <span className="font-display font-semibold text-cream-100 text-lg">The Plinth</span>
            </Link>
          </div>
          <div className="badge bg-teal-900 text-teal-200 mb-3">DSA Partner Application</div>
          <h1 className="font-display text-3xl font-semibold text-cream-100">Apply as a DSA Partner</h1>
          <p className="text-navy-300 mt-2 max-w-xl text-sm leading-relaxed">
            Join The Plinth as a Direct Selling Agent and assist home buyers with loan guidance.
            Complete this application — our team will review and respond within 3–5 business days.
          </p>
        </div>
      </div>

      <div className="page-container py-8">
        <div className="max-w-3xl">
          {/* Compliance notice */}
          <div className="card border-l-4 border-amber-400 bg-amber-50 px-6 py-4 mb-6">
            <p className="text-sm text-amber-900 font-medium mb-1">Compliance Notice</p>
            <p className="text-sm text-amber-800">
              As a DSA Partner on The Plinth, you must not guarantee or promise any loan approval,
              interest rates, loan amounts, eligibility outcomes, or terms to customers.
              You may only assist with the loan application process.
            </p>
          </div>

          {/* Process steps */}
          <div className="card px-6 py-5 mb-8">
            <h2 className="text-sm font-semibold text-navy-700 mb-4">How it works</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              {[
                { step: '1', label: 'Submit Application', desc: 'Complete this form' },
                { step: '2', label: 'Admin Review', desc: '3–5 business days' },
                { step: '3', label: 'Account Activation', desc: 'Receive login credentials' },
                { step: '4', label: 'Access Leads', desc: 'Work assigned, consented leads' },
              ].map(({ step, label, desc }) => (
                <div key={step} className="flex items-start gap-3 flex-1">
                  <div className="w-7 h-7 bg-navy-700 text-cream-100 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">{step}</div>
                  <div>
                    <div className="text-sm font-medium text-navy-800">{label}</div>
                    <div className="text-xs text-navy-500">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <AlertMessage type="error" message={error} className="mb-6" />}

          <form onSubmit={handleSubmit} noValidate className="space-y-8">
            {/* Personal */}
            <div className="card px-6 py-6 space-y-5">
              <h2 className="font-display text-lg font-semibold text-navy-800 border-b border-navy-100 pb-3">Personal Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="label">Full name *</label>
                  <input className={`input ${fieldErrors.applicantName ? 'input-error' : ''}`}
                    value={form.applicantName} onChange={set('applicantName')} placeholder="Priya Sharma" disabled={isLoading} />
                  {fieldErrors.applicantName && <p className="field-error">{fieldErrors.applicantName}</p>}
                </div>
                <div>
                  <label className="label">Email address *</label>
                  <input type="email" className={`input ${fieldErrors.email ? 'input-error' : ''}`}
                    value={form.email} onChange={set('email')} placeholder="priya@example.com" disabled={isLoading} />
                  {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
                </div>
                <div>
                  <label className="label">Mobile number *</label>
                  <input type="tel" className={`input ${fieldErrors.phone ? 'input-error' : ''}`}
                    value={form.phone} onChange={set('phone')} placeholder="9876543210" disabled={isLoading} />
                  {fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
                </div>
              </div>
            </div>

            {/* Professional */}
            <div className="card px-6 py-6 space-y-5">
              <h2 className="font-display text-lg font-semibold text-navy-800 border-b border-navy-100 pb-3">Professional Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="label">Employment type *</label>
                  <select className={`input ${fieldErrors.employmentType ? 'input-error' : ''}`}
                    value={form.employmentType} onChange={set('employmentType')} disabled={isLoading}>
                    <option value="">Select type</option>
                    {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {fieldErrors.employmentType && <p className="field-error">{fieldErrors.employmentType}</p>}
                </div>
                <div>
                  <label className="label">Firm / Organisation name</label>
                  <input className="input" value={form.firmName} onChange={set('firmName')}
                    placeholder="Sharma Finance Services" disabled={isLoading} />
                </div>
                <div>
                  <label className="label">Current organisation</label>
                  <input className="input" value={form.currentOrganization} onChange={set('currentOrganization')}
                    placeholder="ABC Bank" disabled={isLoading} />
                </div>
                <div>
                  <label className="label">Years of experience *</label>
                  <input type="number" min="0" className={`input ${fieldErrors.yearsOfExperience ? 'input-error' : ''}`}
                    value={form.yearsOfExperience} onChange={set('yearsOfExperience')} placeholder="5" disabled={isLoading} />
                  {fieldErrors.yearsOfExperience && <p className="field-error">{fieldErrors.yearsOfExperience}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Bank / NBFC partnerships</label>
                  <input className="input" value={form.bankPartnerships} onChange={set('bankPartnerships')}
                    placeholder="SBI, HDFC, ICICI, LIC Housing Finance…" disabled={isLoading} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Areas of operation</label>
                  <input className="input" value={form.areasOfOperation} onChange={set('areasOfOperation')}
                    placeholder="Bopal, Thaltej, Bodakdev, Satellite (comma-separated)" disabled={isLoading} />
                  <p className="text-xs text-navy-400 mt-1">Enter locality names separated by commas</p>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="card px-6 py-6 space-y-5">
              <h2 className="font-display text-lg font-semibold text-navy-800 border-b border-navy-100 pb-3">Address</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label className="label">Street address *</label>
                  <input className={`input ${fieldErrors.address ? 'input-error' : ''}`}
                    value={form.address} onChange={set('address')} placeholder="Flat 302, Shivalay Apartments, Vastrapur" disabled={isLoading} />
                  {fieldErrors.address && <p className="field-error">{fieldErrors.address}</p>}
                </div>
                <div>
                  <label className="label">City *</label>
                  <input className={`input ${fieldErrors.city ? 'input-error' : ''}`}
                    value={form.city} onChange={set('city')} placeholder="Ahmedabad" disabled={isLoading} />
                  {fieldErrors.city && <p className="field-error">{fieldErrors.city}</p>}
                </div>
                <div>
                  <label className="label">State *</label>
                  <input className={`input ${fieldErrors.state ? 'input-error' : ''}`}
                    value={form.state} onChange={set('state')} placeholder="Gujarat" disabled={isLoading} />
                  {fieldErrors.state && <p className="field-error">{fieldErrors.state}</p>}
                </div>
              </div>
            </div>

            {/* About */}
            <div className="card px-6 py-6 space-y-4">
              <h2 className="font-display text-lg font-semibold text-navy-800 border-b border-navy-100 pb-3">About You</h2>
              <div>
                <label className="label">Brief description *</label>
                <textarea rows={5} className={`input resize-none ${fieldErrors.description ? 'input-error' : ''}`}
                  value={form.description} onChange={set('description')}
                  placeholder="Tell us about your experience in loan assistance, types of loans you handle, your client base, and why you want to partner with The Plinth. Minimum 50 characters."
                  disabled={isLoading} />
                <div className="flex justify-between mt-1">
                  {fieldErrors.description ? <p className="field-error">{fieldErrors.description}</p> : <p className="text-xs text-navy-400">Min 50 characters</p>}
                  <p className="text-xs text-navy-400">{form.description.length}/2000</p>
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8">
              <p className="text-xs text-navy-400 max-w-sm">
                By submitting you agree to The Plinth's terms and confirm you understand the DSA compliance requirements above.
              </p>
              <button type="submit" disabled={isLoading} className="btn-primary btn-lg whitespace-nowrap">
                {isLoading ? <><LoadingSpinner size="sm" /><span>Submitting…</span></> : 'Submit Application'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
