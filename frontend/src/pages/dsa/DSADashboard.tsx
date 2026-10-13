import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';

export default function DSADashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />

      <main className="page-container py-8 space-y-8">
        {/* Header */}
        <section className="card px-8 py-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="badge bg-teal-100 text-teal-800 mb-3">DSA Partner</div>
              <h1 className="font-display text-3xl font-semibold text-navy-900">
                DSA Dashboard
              </h1>
              <p className="text-navy-500 mt-1">
                {user?.name} — Manage your assigned loan assistance leads.
              </p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center text-2xl">
              🤝
            </div>
          </div>
        </section>

        {/* Compliance notice */}
        <section className="card px-6 py-5 border-l-4 border-amber-400 bg-amber-50">
          <p className="text-sm text-amber-900 font-medium mb-1">Important Compliance Notice</p>
          <p className="text-sm text-amber-800">
            As a DSA Partner, you must not guarantee loan approval, interest rates, loan amounts,
            eligibility outcomes, or any other loan terms to customers.
            You may only access leads that are explicitly assigned to you with customer consent.
          </p>
        </section>

        {/* Stats */}
        <section>
          <h2 className="section-title mb-4">Your Activity</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Assigned Leads',    value: '0', icon: '📋' },
              { label: 'Active Leads',      value: '0', icon: '🔄' },
              { label: 'Completed Leads',   value: '0', icon: '✅' },
              { label: 'Pending Review',    value: '0', icon: '⏳' },
            ].map(({ label, value, icon }) => (
              <div key={label} className="card px-5 py-5">
                <div className="text-xl mb-2">{icon}</div>
                <div className="font-display text-2xl font-semibold text-navy-800">{value}</div>
                <div className="text-sm text-navy-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Modules */}
        <section>
          <h2 className="section-title mb-4">Your Modules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DSAModule
              icon="📋"
              title="Loan Leads"
              description="View and manage your assigned loan assistance leads."
            />
            <DSAModule
              icon="📁"
              title="Documents"
              description="Access documents submitted by customers for loan processing."
            />
            <DSAModule
              icon="📊"
              title="Lead Status"
              description="Track the status and progress of each assigned lead."
            />
            <DSAModule
              icon="👤"
              title="Profile"
              description="Manage your DSA profile and partnership details."
              active
              onClick={() => navigate('/dsa/profile')}
            />
          </div>
        </section>
      </main>

      <DSAMobileNav onProfileClick={() => navigate('/dsa/profile')} />
    </div>
  );
}

function DSAModule({
  icon,
  title,
  description,
  active,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={active ? onClick : undefined}
      className={`card px-5 py-5 ${
        active
          ? 'cursor-pointer hover:shadow-card-hover transition-shadow'
          : 'opacity-80'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl">{icon}</span>
      </div>
      <h3 className="font-semibold text-navy-800 mb-1">{title}</h3>
      <p className="text-sm text-navy-500">{description}</p>
      {active && <p className="text-xs text-navy-500 mt-2 font-medium">Open →</p>}
    </div>
  );
}

function DSAMobileNav({ onProfileClick }: { onProfileClick: () => void }) {
  const items = [
    { icon: '📋', label: 'Leads', active: true, action: undefined },
    { icon: '📁', label: 'Documents', active: false, action: undefined },
    { icon: '📊', label: 'Status', active: false, action: undefined },
    { icon: '👤', label: 'Profile', active: true, action: onProfileClick },
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
