import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { AHMEDABAD_LOCALITIES } from '../../types';

export default function CustomerHome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />

      <main className="page-container py-8 space-y-10">
        {/* Welcome */}
        <section className="card px-8 py-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">
              {(user?.loginCount ?? 1) <= 1 ? 'Welcome' : 'Welcome back'}, {user?.name?.split(' ')[0]}
            </h1>
            <p className="text-navy-500 mt-1">
              Discover your next home in Ahmedabad.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn-secondary" onClick={() => navigate('/customer/profile')}>
              My Profile
            </button>
            <button className="btn-primary" onClick={() => navigate('/properties')}>
              Browse Properties
            </button>
          </div>
        </section>

        <section>
          <h2 className="section-title mb-4">Find a Property</h2>
          <div className="card px-6 py-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                className="input flex-1"
                placeholder="Search by locality, project or builder…"
                id="quick-search"
              />
              <select className="input sm:w-48" id="quick-locality">
                <option value="">All Localities</option>
                {AHMEDABAD_LOCALITIES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <button className="btn-gold" onClick={() => navigate('/properties')}>Search</button>
            </div>
          </div>
        </section>

        {/* Dashboard cards */}
        <section>
          <h2 className="section-title mb-4">Your Activity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <DashCard
              icon="🔖"
              label="Saved Properties"
              value="0"
            />
            <DashCard
              icon="🏠"
              label="Site Visits"
              value="0"
            />
            <DashCard
              icon="📄"
              label="Loan Requests"
              value="0"
            />
            <DashCard
              icon="🧠"
              label="Plinth Intelligence"
              value="—"
            />
          </div>
        </section>

        {/* Localities preview */}
        <section>
          <h2 className="section-title mb-4">Explore Localities</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {AHMEDABAD_LOCALITIES.map((locality) => (
              <button
                key={locality}
                disabled
                className="card px-4 py-3 text-left hover:shadow-card-hover transition-shadow opacity-70 cursor-not-allowed"
              >
                <span className="text-sm font-medium text-navy-700">{locality}</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* Bottom mobile nav */}
      <MobileNav />
    </div>
  );
}

function DashCard({
  icon,
  label,
  value,
  note,
}: {
  icon: string;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="card px-5 py-5">
      <div className="text-2xl mb-3">{icon}</div>
      <div className="font-display text-2xl font-semibold text-navy-800">{value}</div>
      <div className="text-sm font-medium text-navy-700 mt-1">{label}</div>
      {note && <div className="text-xs text-navy-400 mt-1">{note}</div>}
    </div>
  );
}

function MobileNav() {
  const navigate = useNavigate();
  const items = [
    { icon: '🏠', label: 'Home', active: true, action: () => navigate('/home') },
    { icon: '🔍', label: 'Search', active: true, action: () => navigate('/properties') },
    { icon: '🔖', label: 'Saved', active: false, action: undefined },
    { icon: '📅', label: 'Visits', active: false, action: undefined },
    { icon: '⋯', label: 'More', active: false, action: undefined },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-navy-100 flex sm:hidden z-40 shadow-nav">
      {items.map(({ icon, label, active, action }) => (
        <button
          key={label}
          onClick={action}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
            active ? 'text-navy-800 font-semibold' : 'text-navy-400'
          }`}
          disabled={!active}
        >
          <span className="text-lg leading-none">{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
