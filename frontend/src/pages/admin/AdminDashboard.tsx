import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { getApplicationStatsApi } from '../../api/applications.api';
import { adminGetUserStatsApi } from '../../api/user.api';
import { adminGetPropertyStatsApi } from '../../api/properties.api';
import type { ApplicationCounts } from '../../types';

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<ApplicationCounts | null>(null);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalProperties, setTotalProperties] = useState<number | null>(null);

  useEffect(() => {
    getApplicationStatsApi()
      .then(setStats)
      .catch(() => { /* non-critical — show dashes on error */ });

    adminGetUserStatsApi()
      .then((data) => setTotalUsers(data.total))
      .catch(() => { /* non-critical */ });

    adminGetPropertyStatsApi()
      .then((data) => setTotalProperties(data.total))
      .catch(() => { /* non-critical */ });
  }, []);

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />

      <main className="page-container py-8 space-y-8">
        {/* Header */}
        <section className="card px-8 py-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="badge bg-purple-100 text-purple-800 mb-3">Admin Account</div>
              <h1 className="font-display text-3xl font-semibold text-navy-900">
                Admin Dashboard
              </h1>
              <p className="text-navy-500 mt-1">
                {user?.name} — Platform administration and oversight.
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-2xl">
              🛡️
            </div>
          </div>
        </section>

        {/* Stats overview */}
        <section>
          <h2 className="section-title mb-4">Platform Overview</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon="👥"
              label="Total Users"
              value={totalUsers !== null ? String(totalUsers) : '…'}
            />
            <StatCard
              icon="⏳"
              label="Pending Builders"
              value={stats ? String(stats.builderPending) : '…'}
              highlight={stats ? stats.builderPending > 0 : false}
              onClick={() => navigate('/admin/applications')}
            />
            <StatCard
              icon="⏳"
              label="Pending DSAs"
              value={stats ? String(stats.dsaPending) : '…'}
              highlight={stats ? stats.dsaPending > 0 : false}
              onClick={() => navigate('/admin/applications')}
            />
            <StatCard
              icon="🏢"
              label="Properties"
              value={totalProperties !== null ? String(totalProperties) : '…'}
              onClick={() => navigate('/admin/properties')}
            />
          </div>
        </section>

        {/* Module grid */}
        <section>
          <h2 className="section-title mb-4">Administration Modules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AdminModule
              icon="🏗️"
              title="Builder Applications"
              description="Review, approve or reject builder onboarding applications."
              badge={stats && stats.builderPending > 0 ? `${stats.builderPending} pending` : undefined}
              badgeStyle="bg-amber-100 text-amber-800"
              active
              onClick={() => navigate('/admin/applications')}
            />
            <AdminModule
              icon="🤝"
              title="DSA Applications"
              description="Review, approve or reject DSA partner onboarding applications."
              badge={stats && stats.dsaPending > 0 ? `${stats.dsaPending} pending` : undefined}
              badgeStyle="bg-amber-100 text-amber-800"
              active
              onClick={() => navigate('/admin/applications')}
            />
            <AdminModule
              icon="🏢"
              title="Property Review"
              description="Review submitted properties. Approve, reject or request changes."
              badge={undefined}
              badgeStyle=""
              active
              onClick={() => navigate('/admin/properties')}
            />
            <AdminModule
              icon="👥"
              title="User Management"
              description="Manage user accounts, roles, and suspension status."
              day="Future"
            />
            <AdminModule
              icon="📊"
              title="Platform Analytics"
              description="Overview of platform usage, leads, visits and activity."
              day="Future"
            />
            <AdminModule
              icon="⚙️"
              title="Operations"
              description="Platform settings, notifications and system configuration."
              day="Future"
            />
          </div>
        </section>
      </main>

      <AdminMobileNav onApplicationsClick={() => navigate('/admin/applications')} />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  note,
  highlight,
  onClick,
}: {
  icon: string;
  label: string;
  value: string;
  note?: string;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`card px-5 py-5 ${onClick ? 'cursor-pointer hover:shadow-card-hover transition-shadow' : ''} ${
        highlight ? 'border-amber-300 bg-amber-50' : ''
      }`}
    >
      <div className="text-xl mb-2">{icon}</div>
      <div className={`font-display text-2xl font-semibold ${highlight ? 'text-amber-700' : 'text-navy-800'}`}>
        {value}
      </div>
      <div className="text-sm text-navy-500 mt-1">{label}</div>
      {note && <div className="text-xs text-navy-400 mt-0.5">{note}</div>}
    </div>
  );
}

function AdminModule({
  icon,
  title,
  description,
  day,
  badge,
  badgeStyle,
  active,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  day?: string;
  badge?: string;
  badgeStyle?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={active ? onClick : undefined}
      className={`card px-5 py-5 transition-shadow ${
        active
          ? 'cursor-pointer hover:shadow-card-hover'
          : 'opacity-75'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl">{icon}</span>
        {badge ? (
          <span className={`badge text-xs ${badgeStyle}`}>{badge}</span>
        ) : day ? (
          <span className="badge bg-purple-100 text-purple-700 text-xs">{day}</span>
        ) : null}
      </div>
      <h3 className="font-semibold text-navy-800 mb-1">{title}</h3>
      <p className="text-sm text-navy-500">{description}</p>
      {active && (
        <p className="text-xs text-navy-500 mt-2 font-medium hover:text-navy-700">Open →</p>
      )}
    </div>
  );
}

function AdminMobileNav({ onApplicationsClick }: { onApplicationsClick: () => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-navy-100 flex sm:hidden z-40 shadow-nav">
      {[
        { icon: '📊', label: 'Overview', active: true, action: undefined },
        { icon: '✅', label: 'Approvals', active: true, action: onApplicationsClick },
        { icon: '⚙️', label: 'Operations', active: false, action: undefined },
        { icon: '📋', label: 'Leads', active: false, action: undefined },
        { icon: '⋯', label: 'More', active: false, action: undefined },
      ].map(({ icon, label, active, action }) => (
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
