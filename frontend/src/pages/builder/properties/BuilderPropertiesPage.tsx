import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../../components/layout/Navbar';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import AlertMessage from '../../../components/ui/AlertMessage';
import PropertyStatusBadge from '../../../components/property/PropertyStatusBadge';
import { getMyPropertiesApi, submitPropertyApi, deletePropertyApi } from '../../../api/properties.api';
import { getErrorMessage } from '../../../api/client';
import { formatPriceRange, formatDate } from '../../../utils/format';
import type { Property, PropertyStatus } from '../../../types';

const STATUS_TABS: { label: string; value: PropertyStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Drafts', value: 'DRAFT' },
  { label: 'Submitted', value: 'SUBMITTED' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Changes Needed', value: 'CHANGES_REQUESTED' },
  { label: 'Rejected', value: 'REJECTED' },
];

export default function BuilderPropertiesPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<PropertyStatus | 'ALL'>('ALL');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchProperties = async () => {
    setIsLoading(true); setError('');
    try { setProperties(await getMyPropertiesApi()); }
    catch (e) { setError(getErrorMessage(e)); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchProperties(); }, []);

  const displayed = activeTab === 'ALL'
    ? properties
    : properties.filter((p) => p.status === activeTab);

  const counts = properties.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleSubmit = async (id: string) => {
    setActionLoading(id);
    try {
      const updated = await submitPropertyApi(id);
      setProperties((prev) => prev.map((p) => (p._id === id ? updated : p)));
    } catch (e) { alert(getErrorMessage(e)); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async (id: string) => {
    setActionLoading(id);
    try {
      await deletePropertyApi(id);
      setProperties((prev) => prev.filter((p) => p._id !== id));
    } catch (e) { alert(getErrorMessage(e)); }
    finally { setActionLoading(null); setConfirmDelete(null); }
  };

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />
      <main className="page-container py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <button onClick={() => navigate('/builder')} className="text-navy-500 hover:text-navy-800 text-sm mb-1 block">← Dashboard</button>
            <h1 className="font-display text-2xl font-semibold text-navy-900">My Listings</h1>
            <p className="text-navy-500 text-sm mt-0.5">{properties.length} propert{properties.length === 1 ? 'y' : 'ies'} total</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchProperties()}
              disabled={isLoading}
              className="btn btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
              title="Refresh listings"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
            <button onClick={() => navigate('/builder/properties/new')} className="btn-primary">
              + New Property
            </button>
          </div>
        </div>

        {error && <AlertMessage type="error" message={error} />}

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1">
          {STATUS_TABS.map(({ label, value }) => {
            const count = value === 'ALL' ? properties.length : (counts[value] || 0);
            return (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === value ? 'bg-navy-800 text-cream-100' : 'text-navy-500 hover:bg-navy-100'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs leading-none ${
                    activeTab === value ? 'bg-white/20 text-white' : 'bg-navy-100 text-navy-600'
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><LoadingSpinner size="lg" /></div>
          ) : displayed.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="text-4xl">🏗️</div>
              <p className="font-medium text-navy-700">
                {activeTab === 'ALL' ? 'No properties yet' : `No ${activeTab.toLowerCase().replace('_', ' ')} properties`}
              </p>
              {activeTab === 'ALL' && (
                <button onClick={() => navigate('/builder/properties/new')} className="btn-primary btn mt-2">
                  Create your first property
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-100 bg-cream-100 text-left text-xs font-semibold text-navy-600 uppercase tracking-wide">
                    <th className="px-5 py-3">Property</th>
                    <th className="px-5 py-3">Location</th>
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Updated</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {displayed.map((p) => (
                    <tr key={p._id} className="hover:bg-cream-100 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-medium text-navy-800 text-sm">{p.projectName}</div>
                        <div className="text-xs text-navy-500 mt-0.5">{p.title}</div>
                        <div className="text-xs text-navy-400">{p.propertyType}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-navy-700">
                        <div>{p.locality}</div>
                        <div className="text-xs text-navy-500">{p.city}</div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="price-text-sm">
                          {formatPriceRange(p.minPrice, p.maxPrice)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <PropertyStatusBadge status={p.status} />
                        {p.status === 'CHANGES_REQUESTED' && p.adminNotes && (
                          <p className="text-xs text-amber-700 mt-1 max-w-xs truncate" title={p.adminNotes}>
                            {p.adminNotes}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-navy-500 whitespace-nowrap">
                        {formatDate(p.updatedAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {(p.status === 'DRAFT' || p.status === 'CHANGES_REQUESTED') && (
                            <>
                              <button
                                onClick={() => navigate(`/builder/properties/${p._id}/edit`)}
                                className="text-xs text-navy-600 hover:text-navy-900 font-medium underline-offset-2 hover:underline"
                              >Edit</button>
                              <button
                                onClick={() => handleSubmit(p._id)}
                                disabled={actionLoading === p._id}
                                className="btn btn-gold text-xs px-3 py-1.5"
                              >
                                {actionLoading === p._id ? <LoadingSpinner size="sm" /> : 'Submit'}
                              </button>
                            </>
                          )}
                          {p.status === 'APPROVED' && (
                            <button
                              onClick={() => navigate(`/builder/properties/${p._id}/edit`)}
                              className="text-xs text-navy-600 hover:text-navy-900 font-medium underline-offset-2 hover:underline"
                            >Edit</button>
                          )}
                          <button
                            onClick={() => navigate(`/builder/properties/${p._id}/blueprints`)}
                            className="text-xs text-indigo-600 hover:text-indigo-900 font-medium underline-offset-2 hover:underline"
                          >Blueprints</button>
                          {p.status !== 'DRAFT' && p.status !== 'APPROVED' && (
                            <button
                              onClick={() => navigate(`/builder/properties/${p._id}/edit`)}
                              className="text-xs text-navy-500 hover:text-navy-700 font-medium underline-offset-2 hover:underline"
                            >View</button>
                          )}
                          {p.status === 'DRAFT' && confirmDelete === p._id ? (
                            <span className="flex items-center gap-1">
                              <button onClick={() => handleDelete(p._id)} disabled={actionLoading === p._id}
                                className="text-xs text-red-600 font-medium hover:text-red-800">Confirm</button>
                              <button onClick={() => setConfirmDelete(null)} className="text-xs text-navy-400 hover:text-navy-600">Cancel</button>
                            </span>
                          ) : p.status === 'DRAFT' ? (
                            <button onClick={() => setConfirmDelete(p._id)}
                              className="text-xs text-navy-400 hover:text-red-600 transition-colors">Delete</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
