import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signupApi } from '../../api/auth.api';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import AlertMessage from '../../components/ui/AlertMessage';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

interface FormState {
  name: string;
  email: string;
  password: string;
  phone: string;
}

const INITIAL: FormState = { name: '', email: '', password: '', phone: '' };

export default function SignupPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [form, setForm]           = useState<FormState>(INITIAL);
  const [showPass, setShowPass]   = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      // Clear field error on change
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
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      };

      const user = await signupApi(payload);
      setUser(user);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setFieldErrors(getFieldErrors(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
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
            Start your real estate journey in Ahmedabad
          </h1>
          <p className="text-navy-300 text-lg leading-relaxed">
            Create a free account to discover properties, save favourites, and get intelligent insights.
          </p>
          <ul className="space-y-3 text-navy-300 text-sm">
            {[
              'Browse verified property listings',
              'AI-powered blueprint visualisation',
              'Request site visits directly',
              'Smart Living Score & intelligence',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="text-gold-400">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-navy-400 text-sm">
          © {new Date().getFullYear()} The Plinth. All rights reserved.
        </p>
      </div>

      {/* Right — form */}
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
            <h2 className="font-display text-3xl font-semibold text-navy-900">Create account</h2>
            <p className="text-navy-500 mt-1 text-sm">Join The Plinth as a customer — free forever.</p>
          </div>

          {error && <AlertMessage type="error" message={error} className="mb-6" />}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Name */}
            <div>
              <label htmlFor="name" className="label">Full name</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={set('name')}
                className={`input ${fieldErrors.name ? 'input-error' : ''}`}
                placeholder="Raj Mehta"
                required
                disabled={isLoading}
              />
              {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={set('email')}
                className={`input ${fieldErrors.email ? 'input-error' : ''}`}
                placeholder="you@example.com"
                required
                disabled={isLoading}
              />
              {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set('password')}
                  className={`input pr-12 ${fieldErrors.password ? 'input-error' : ''}`}
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
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
              {!fieldErrors.password && (
                <p className="text-xs text-navy-400 mt-1">
                  At least 8 characters with 1 uppercase letter and 1 number.
                </p>
              )}
            </div>

            {/* Phone (optional) */}
            <div>
              <label htmlFor="phone" className="label">
                Mobile number <span className="text-navy-400 font-normal">(optional)</span>
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={set('phone')}
                className={`input ${fieldErrors.phone ? 'input-error' : ''}`}
                placeholder="9876543210"
                disabled={isLoading}
              />
              {fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading || !form.name || !form.email || !form.password}
              className="btn-primary btn-lg w-full mt-2"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Creating account…</span>
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-navy-500 mt-8">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-navy-700 font-medium hover:text-gold-600 underline-offset-2 hover:underline"
            >
              Sign in
            </Link>
          </p>

          <p className="text-center text-xs text-navy-400 mt-4">
            By creating an account you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
