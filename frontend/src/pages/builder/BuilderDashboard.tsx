import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { getMyPropertiesApi } from '../../api/properties.api';

export default function BuilderDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [navigatingBlueprints, setNavigatingBlueprints] = useState(false);

  const handleBlueprintsClick = async () => {
    if (navigatingBlueprints) return;
    setNavigatingBlueprints(true);
    try {
      const properties = await getMyPropertiesApi();
      if (properties && properties.length > 0) {
        navigate(`/builder/properties/${properties[0]._id}/blueprints`);
      } else {
        navigate('/builder/properties');
      }
    } catch {
      navigate('/builder/properties');
    } finally {
      setNavigatingBlueprints(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />

      <main className="page-container py-8 space-y-8">
        {/* Header */}
        <section className="card px-8 py-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="badge bg-indigo-100 text-indigo-800 mb-3">Builder Account</div>
              <h1 className="font-display text-3xl font-semibold text-navy-900">
                Builder Dashboard
              </h1>
              <p className="text-navy-500 mt-1">
                {user?.name} — Manage your property listings and project blueprints.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/builder/profile')}
                className="btn-secondary text-xs px-3 py-2"
              >
                Builder Profile
              </button>
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-2xl">
                🏗️
              </div>
            </div>
          </div>
        </section>

        {/* Modules */}
        <section>
          <h2 className="section-title mb-4">Your Modules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <ModuleCard
              icon="📋"
              title="My Listings"
              description="Create and manage your property listings. Submit for admin approval."
              active
              onClick={() => navigate('/builder/properties')}
            />
            <ModuleCard
              icon="📐"
              title="Blueprints"
              description="Upload full property blueprints and individual unit-type blueprints."
              active
              onClick={handleBlueprintsClick}
            />
            <ModuleCard
              icon="📅"
              title="Site Visits"
              description="Review and manage customer site visit requests."
            />
            <ModuleCard
              icon="📊"
              title="Analytics"
              description="Track property views, enquiries and lead activity."
            />
            <ModuleCard
              icon="📁"
              title="Documents"
              description="Upload RERA certificates, approvals and other project documents."
            />
            <ModuleCard
              icon="🔔"
              title="Notifications"
              description="Admin feedback, approval updates and customer activity."
            />
          </div>
        </section>
      </main>

      <BuilderMobileNav onBlueprintsClick={handleBlueprintsClick} />
    </div>
  );
}

function ModuleCard({
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

function BuilderMobileNav({ onBlueprintsClick }: { onBlueprintsClick: () => void }) {
  const navigate = useNavigate();
  const items = [
    { icon: '📊', label: 'Dashboard', active: true, action: () => navigate('/builder') },
    { icon: '📋', label: 'Listings', active: true, action: () => navigate('/builder/properties') },
    { icon: '📐', label: 'Blueprints', active: true, action: onBlueprintsClick },
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

