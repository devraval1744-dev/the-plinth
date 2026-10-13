import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import AlertMessage from '../../components/ui/AlertMessage';
import BlueprintViewer from '../../components/blueprint/BlueprintViewer';
import Blueprint3DViewer from '../../components/blueprint3d/Blueprint3DViewer';
import PropertyAmenitiesMap from '../../components/location/PropertyAmenitiesMap';
import { getPublicPropertyApi, getNearbyAmenitiesApi } from '../../api/properties.api';
import { getPublicBlueprintsApi, getPublic3DApi } from '../../api/blueprints.api';
import { getErrorMessage } from '../../api/client';
import { formatPrice, formatDate, getBuilderName } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import type { Property, BHKConfig, Blueprint, Public3DResult, NearbyAmenitiesData } from '../../types';

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [property, setProperty] = useState<Property | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [selectedBHK, setSelectedBHK] = useState<BHKConfig | null>(null);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedBpId, setSelectedBpId] = useState<string | null>(null);
  const [active3DId, setActive3DId] = useState<string | null>(null);
  const [threeDData, setThreeDData] = useState<Record<string, Public3DResult | 'loading' | 'error'>>({});
  const [amenitiesData, setAmenitiesData] = useState<NearbyAmenitiesData | null>(null);
  const [isAmenitiesLoading, setIsAmenitiesLoading] = useState(false);
  const [amenitiesError, setAmenitiesError] = useState('');

  const fetchNearby = (propertyId: string) => {
    setIsAmenitiesLoading(true);
    setAmenitiesError('');
    getNearbyAmenitiesApi(propertyId)
      .then((data) => setAmenitiesData(data))
      .catch((err) => setAmenitiesError(getErrorMessage(err)))
      .finally(() => setIsAmenitiesLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    getPublicPropertyApi(id)
      .then((p) => {
        setProperty(p);
        if (p.bhkConfigurations.length > 0) setSelectedBHK(p.bhkConfigurations[0]);
        // Fetch blueprints in parallel (non-blocking — doesn't block page render)
        getPublicBlueprintsApi(id)
          .then((bps) => {
            setBlueprints(bps);
            const firstProp = bps.find((b) => b.level === 'PROPERTY');
            if (firstProp) setSelectedBpId(null); // Start with no selection
          })
          .catch(() => { /* blueprints unavailable — not fatal */ });

        // Fetch nearby amenities in parallel (non-blocking)
        fetchNearby(id);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setIsLoading(false));
  }, [id]);

  const load3D = async (bpId: string, propertyId: string) => {
    if (active3DId === bpId) { setActive3DId(null); return; }
    setActive3DId(bpId);
    if (threeDData[bpId]) return; // already loaded or loading
    setThreeDData((prev) => ({ ...prev, [bpId]: 'loading' }));
    try {
      const result = await getPublic3DApi(propertyId, bpId);
      setThreeDData((prev) => ({ ...prev, [bpId]: result }));
    } catch {
      setThreeDData((prev) => ({ ...prev, [bpId]: 'error' }));
    }
  };

  if (isLoading) {    return (
      <div className="min-h-screen bg-cream-200"><Navbar />
        <div className="flex items-center justify-center py-32"><LoadingSpinner size="lg" /></div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="min-h-screen bg-cream-200"><Navbar />
        <div className="page-container py-16 text-center space-y-4">
          <AlertMessage type="error" message={error || 'Property not found'} />
          <button onClick={() => navigate('/properties')} className="btn-primary btn">← Back to Search</button>
        </div>
      </div>
    );
  }

  const builderName = getBuilderName(property.builderId as any);
  const images = property.images && property.images.length > 0
    ? property.images
    : property.coverImageUrl
    ? [{ url: property.coverImageUrl, isPrimary: true, uploadedAt: '' }]
    : [{ url: '', isPrimary: true, uploadedAt: '' }];
  const publicDocuments = property.documents.filter((d) => d.isPublic);

  return (
    <div className="min-h-screen bg-cream-200 pb-24">
      <Navbar />

      <div className="page-container py-8 space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-navy-500">
          <Link to="/properties" className="hover:text-navy-800 transition-colors">Properties</Link>
          <span>/</span>
          <span className="text-navy-700">{property.locality}</span>
          <span>/</span>
          <span className="text-navy-800 font-medium">{property.projectName}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── Left column ───────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Image gallery */}
            <div className="card overflow-hidden">
              <div className="h-72 sm:h-96 bg-navy-100 relative">
                {images[activeImage]?.url ? (
                  <img
                    src={images[activeImage].url}
                    alt={property.projectName}
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.src.includes('/demo/demo_property_1.jpg')) {
                        target.src = '/demo/demo_property_1.jpg';
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-navy-800 to-navy-900">
                    <span className="text-6xl opacity-20">🏗️</span>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex gap-1">
                  {images.length > 1 && images.map((_, i) => (
                    <button key={i} onClick={() => setActiveImage(i)}
                      className={`w-2 h-2 rounded-full transition-all ${i === activeImage ? 'bg-white scale-125' : 'bg-white/50'}`} />
                  ))}
                </div>
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 px-4 py-3 overflow-x-auto">
                  {images.map((img, i) => (
                    <button key={i} onClick={() => setActiveImage(i)}
                      className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                        i === activeImage ? 'border-navy-700' : 'border-transparent'
                      }`}>
                      {img.url ? (
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-navy-200" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Title & overview */}
            <div className="card px-6 py-6 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge text-xs ${
                      property.constructionStatus === 'Ready to Move' ? 'bg-green-100 text-green-800'
                      : property.constructionStatus === 'New Launch' ? 'bg-gold-500 text-white'
                      : 'badge-navy'
                    }`}>{property.constructionStatus}</span>
                    <span className="badge-navy text-xs">{property.propertyType}</span>
                  </div>
                  <h1 className="font-display text-2xl font-semibold text-navy-900">{property.projectName}</h1>
                  <p className="text-navy-600 mt-0.5">{property.title}</p>
                  <p className="flex items-center gap-1 text-sm text-navy-500 mt-1">
                    <span>📍</span> {property.address}
                  </p>
                </div>
                <div className="text-right">
                  <p className="price-text-lg">
                    {formatPrice(property.minPrice)}
                    {property.minPrice !== property.maxPrice && (
                      <span className="text-navy-500"> – {formatPrice(property.maxPrice)}</span>
                    )}
                  </p>
                  <p className="text-sm text-navy-500">{property.minArea}–{property.maxArea} sq.ft</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Units', value: property.totalUnits.toString() },
                  { label: 'Available', value: property.availableUnits.toString() },
                  { label: 'Possession', value: property.possessionDate ? formatDate(property.possessionDate) : '—' },
                  { label: 'Builder', value: builderName },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-cream-100 rounded-lg px-3 py-3 text-center">
                    <p className="text-xs text-navy-500">{label}</p>
                    <p className="font-semibold text-navy-800 text-sm mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="card px-6 py-6">
              <h2 className="font-display text-lg font-semibold text-navy-800 mb-3">About This Project</h2>
              <p className="text-navy-700 leading-relaxed text-sm whitespace-pre-line">{property.description}</p>
            </div>

            {/* BHK configurations */}
            {property.bhkConfigurations.length > 0 && (
              <div className="card px-6 py-6">
                <h2 className="font-display text-lg font-semibold text-navy-800 mb-4">Unit Configurations</h2>
                <div className="flex flex-wrap gap-2 mb-4">
                  {property.bhkConfigurations.map((b, i) => {
                    const hasBp = blueprints.some((bp) => bp.level === 'UNIT' && bp.unitType === b.type && bp.status === 'ACTIVE');
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          setSelectedBHK(b);
                          const matchingBp = blueprints.find((bp) => bp.level === 'UNIT' && bp.unitType === b.type && bp.status === 'ACTIVE');
                          if (matchingBp) {
                            setSelectedBpId(matchingBp._id);
                          }
                        }}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all flex items-center gap-1.5 ${
                          selectedBHK?.type === b.type && selectedBHK?.areaSqFt === b.areaSqFt
                            ? 'bg-navy-700 text-cream-100 border-navy-700'
                            : 'border-navy-200 text-navy-600 hover:border-navy-400'
                        }`}
                      >
                        <span>{b.type}</span>
                        {hasBp && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-normal ${
                            selectedBHK?.type === b.type && selectedBHK?.areaSqFt === b.areaSqFt
                              ? 'bg-gold-500/30 text-cream-100'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            Blueprint Available
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedBHK && (
                  <div className="bg-cream-100 rounded-xl px-5 py-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <BHKStat label="Configuration" value={selectedBHK.type} />
                    <BHKStat label="Area" value={`${selectedBHK.areaSqFt} sq.ft`} />
                    <BHKStat label="Price range" value={`${formatPrice(selectedBHK.priceMin)} – ${formatPrice(selectedBHK.priceMax)}`} isPrice />
                    <BHKStat label="Total units" value={selectedBHK.totalUnits.toString()} />
                    <BHKStat label="Available" value={selectedBHK.availableUnits.toString()} />
                    {(() => {
                      const matchingBp = blueprints.find((bp) => bp.level === 'UNIT' && bp.unitType === selectedBHK.type && bp.status === 'ACTIVE');
                      return (
                        <div>
                          <p className="text-xs text-navy-500">Blueprint Document</p>
                          {matchingBp ? (
                            <button
                              onClick={() => setSelectedBpId((prev) => prev === matchingBp._id ? null : matchingBp._id)}
                              className="text-xs font-semibold text-gold-600 hover:underline mt-0.5 flex items-center gap-1"
                            >
                              <span>📐 View {selectedBHK.type} Blueprint</span>
                            </button>
                          ) : (
                            <p className="text-xs text-navy-400 mt-0.5">Pending upload</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Blueprints section — Day 4 */}
                {blueprints.length > 0 && (
                  <div className="mt-4 border-t border-navy-100 pt-5 space-y-4">
                    <h3 className="font-semibold text-navy-800 text-sm">Blueprints</h3>

                    {/* Property-level blueprint */}
                    {(() => {
                      const propBp = blueprints.find((b) => b.level === 'PROPERTY' && b.status === 'ACTIVE');
                      return propBp ? (
                        <div>
                          <button
                            onClick={() => setSelectedBpId((prev) => prev === propBp._id ? null : propBp._id)}
                            className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                              selectedBpId === propBp._id
                                ? 'bg-navy-700 text-cream-100 border-navy-700'
                                : 'border-navy-200 text-navy-600 hover:border-navy-400'
                            }`}
                          >
                            📐 Full Property Blueprint
                          </button>
                          {selectedBpId === propBp._id && (
                            <div className="mt-3 space-y-3">
                              <BlueprintViewer blueprint={propBp} />
                              {/* 3D visualization */}
                              <button
                                onClick={() => load3D(propBp._id, property._id)}
                                className={`btn w-full text-sm ${active3DId === propBp._id ? 'btn-primary' : 'btn-secondary'}`}
                              >
                                {active3DId === propBp._id ? '▲ Hide 3D View' : '▶ View 3D Visualization'}
                              </button>
                              {active3DId === propBp._id && (() => {
                                const d = threeDData[propBp._id];
                                if (d === 'loading') return <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>;
                                if (d === 'error') return <p className="text-sm text-navy-500 text-center py-6">3D visualization currently unavailable. <button onClick={() => { setThreeDData((p) => { const n={...p}; delete n[propBp._id]; return n; }); load3D(propBp._id, property._id); }} className="underline">Retry</button></p>;
                                if (d && typeof d === 'object') return <Blueprint3DViewer data={d.analysis} isDemo={d.isDemo} provider={d.provider} />;
                                return null;
                              })()}
                            </div>
                          )}
                        </div>
                      ) : null;
                    })()}

                    {/* Unit blueprints */}
                    {property.bhkConfigurations.map((cfg, i) => {
                      const unitBp = blueprints.find(
                        (b) => b.level === 'UNIT' && b.unitType === cfg.type && b.status === 'ACTIVE'
                      );
                      if (!unitBp) return null;
                      return (
                        <div key={i}>
                          <button
                            onClick={() => setSelectedBpId((prev) => prev === unitBp._id ? null : unitBp._id)}
                            className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                              selectedBpId === unitBp._id
                                ? 'bg-navy-700 text-cream-100 border-navy-700'
                                : 'border-navy-200 text-navy-600 hover:border-navy-400'
                            }`}
                          >
                            🏠 {cfg.type} Floor Plan
                          </button>
                          {selectedBpId === unitBp._id && (
                            <div className="mt-3 space-y-3">
                              <BlueprintViewer blueprint={unitBp} />
                              {/* 3D visualization */}
                              <button
                                onClick={() => load3D(unitBp._id, property._id)}
                                className={`btn w-full text-sm ${active3DId === unitBp._id ? 'btn-primary' : 'btn-secondary'}`}
                              >
                                {active3DId === unitBp._id ? '▲ Hide 3D View' : '▶ View 3D Visualization'}
                              </button>
                              {active3DId === unitBp._id && (() => {
                                const d = threeDData[unitBp._id];
                                if (d === 'loading') return <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>;
                                if (d === 'error') return <p className="text-sm text-navy-500 text-center py-6">3D visualization currently unavailable. <button onClick={() => { setThreeDData((p) => { const n={...p}; delete n[unitBp._id]; return n; }); load3D(unitBp._id, property._id); }} className="underline">Retry</button></p>;
                                if (d && typeof d === 'object') return <Blueprint3DViewer data={d.analysis} isDemo={d.isDemo} provider={d.provider} />;
                                return null;
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* No blueprints yet placeholder */}
                {blueprints.length === 0 && (
                  <div className="mt-4 bg-navy-50 border border-navy-200 rounded-xl px-5 py-5 text-center space-y-1">
                    <p className="text-sm font-medium text-navy-700">Blueprints</p>
                    <p className="text-xs text-navy-500">
                      Blueprint documents will be available once uploaded by the builder.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Amenities */}
            {property.amenities.length > 0 && (
              <div className="card px-6 py-6">
                <h2 className="font-display text-lg font-semibold text-navy-800 mb-4">Amenities</h2>
                <div className="flex flex-wrap gap-2">
                  {property.amenities.map((a) => (
                    <span key={a} className="badge-navy">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Documents */}
            {publicDocuments.length > 0 && (
              <div className="card px-6 py-6">
                <h2 className="font-display text-lg font-semibold text-navy-800 mb-4">Project Documents</h2>
                <div className="space-y-2">
                  {publicDocuments.map((doc, i) => (
                    <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 bg-cream-100 rounded-lg hover:bg-navy-50 transition-colors group">
                      <span className="text-xl">📄</span>
                      <span className="text-sm text-navy-700 group-hover:text-navy-900 font-medium">{doc.name}</span>
                      <span className="ml-auto text-xs text-navy-400">↗</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Nearby Amenities & Location Intelligence */}
            <div className="card px-6 py-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-semibold text-navy-800">
                    Nearby Amenities & Location Intelligence
                  </h2>
                  <p className="text-xs text-navy-500 mt-0.5">
                    Explore schools, healthcare, shopping, and transit around {property.projectName}
                  </p>
                </div>
                {property.latitude && property.longitude && (
                  <button
                    onClick={() => fetchNearby(property._id)}
                    disabled={isAmenitiesLoading}
                    className="text-xs text-navy-600 hover:text-navy-900 font-medium underline disabled:opacity-50"
                  >
                    {isAmenitiesLoading ? 'Refreshing...' : '🔄 Refresh'}
                  </button>
                )}
              </div>

              {/* State handling */}
              {isAmenitiesLoading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-2">
                  <LoadingSpinner size="md" />
                  <p className="text-xs text-navy-500">Retrieving nearby location data via OpenStreetMap...</p>
                </div>
              ) : amenitiesError ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center space-y-2">
                  <p className="text-xs text-red-700 font-medium">{amenitiesError}</p>
                  <button
                    onClick={() => fetchNearby(property._id)}
                    className="btn btn-secondary text-xs px-3 py-1.5"
                  >
                    Try Again
                  </button>
                </div>
              ) : !amenitiesData || !amenitiesData.hasCoordinates ? (
                <div className="bg-cream-100 border border-navy-100 rounded-xl p-6 text-center space-y-1">
                  <span className="text-2xl block mb-1">📍</span>
                  <p className="text-sm font-medium text-navy-700">Property Location Pin Pending</p>
                  <p className="text-xs text-navy-500 max-w-md mx-auto">
                    The builder has not marked the exact map coordinates for this property yet. Address: {property.address}, {property.locality}, {property.city}.
                  </p>
                </div>
              ) : (
                <PropertyAmenitiesMap
                  propertyName={property.projectName}
                  data={amenitiesData}
                />
              )}
            </div>
          </div>

          {/* ── Right column — sticky action card ─────────────────────────── */}
          <div className="space-y-4">
            <div className="card px-6 py-6 space-y-4 lg:sticky lg:top-6">
              <div>
                <p className="price-text-lg">
                  {formatPrice(property.minPrice)}
                  {property.minPrice !== property.maxPrice && <span className="text-navy-500 text-base font-normal"> onwards</span>}
                </p>
                <p className="text-sm text-navy-500 mt-0.5">{property.locality}, {property.city}</p>
              </div>

              {/* Site visit — Day 6 placeholder */}
              <div>
                <button disabled className="btn-primary btn-lg w-full opacity-60 cursor-not-allowed">
                  Request Site Visit
                </button>
                <p className="text-xs text-navy-400 text-center mt-1">Site visit booking coming soon</p>
              </div>

              {/* Loan assistance — Day 6 placeholder */}
              <div>
                <button disabled className="btn-secondary btn w-full opacity-60 cursor-not-allowed">
                  Loan Assistance
                </button>
                <p className="text-xs text-navy-400 text-center mt-1">Connect with a verified DSA</p>
              </div>

              {/* Plinth Intelligence — Day 6 placeholder */}
              <div className="border-t border-navy-100 pt-4 space-y-3">
                <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Plinth Intelligence</p>
                <div className="bg-cream-100 rounded-lg px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-navy-700">Smart Living Score</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-navy-700">Why This Property?</span>
                  </div>
                </div>
              </div>

              {!isAuthenticated && (
                <p className="text-xs text-navy-500 text-center">
                  <Link to="/login" className="text-navy-700 font-medium hover:underline">Sign in</Link> to save this property and request a visit.
                </p>
              )}
            </div>

            {/* Builder card */}
            <div className="card px-5 py-5 space-y-2">
              <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Listed by</p>
              <p className="font-semibold text-navy-800">{builderName}</p>
              <p className="text-xs text-navy-500">Verified Builder · The Plinth</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BHKStat({ label, value, isPrice }: { label: string; value: string; isPrice?: boolean }) {
  return (
    <div>
      <p className="text-xs text-navy-500">{label}</p>
      <p className={isPrice ? 'price-text-sm mt-0.5' : 'font-semibold text-navy-800 text-sm mt-0.5'}>{value}</p>
    </div>
  );
}
