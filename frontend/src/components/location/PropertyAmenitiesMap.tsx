import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { NearbyAmenity, NearbyAmenitiesData } from '../../types';

// Distinct SVG marker generator for property vs different facility categories
function createCustomIcon(color: string, label: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="30" height="40">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26s16-14 16-26c0-8.84-7.16-16-16-16z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="16" cy="15" r="7" fill="#ffffff" opacity="0.9"/>
      <text x="16" y="19" font-size="11" font-weight="bold" fill="${color}" text-anchor="middle">${label}</text>
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: 'custom-leaflet-marker',
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36],
  });
}

// Icons for property and categories
const PROPERTY_ICON = createCustomIcon('#1B2A4A', '🏠'); // Navy for the Plinth property
const EDUCATION_ICON = createCustomIcon('#2563EB', '🎓'); // Blue
const HEALTHCARE_ICON = createCustomIcon('#DC2626', '🏥'); // Red
const SHOPPING_ICON = createCustomIcon('#D97706', '🛍️'); // Amber
const TRANSIT_ICON = createCustomIcon('#059669', '🚇'); // Green

function getCategoryIcon(category: string) {
  switch (category) {
    case 'education': return EDUCATION_ICON;
    case 'healthcare': return HEALTHCARE_ICON;
    case 'shopping': return SHOPPING_ICON;
    case 'transit': return TRANSIT_ICON;
    default: return EDUCATION_ICON;
  }
}

function getCategoryBadgeClass(category: string) {
  switch (category) {
    case 'education': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'healthcare': return 'bg-red-100 text-red-800 border-red-200';
    case 'shopping': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'transit': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

interface PropertyAmenitiesMapProps {
  propertyName: string;
  data: NearbyAmenitiesData;
}

export default function PropertyAmenitiesMap({
  propertyName,
  data,
}: PropertyAmenitiesMapProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAmenityId, setSelectedAmenityId] = useState<string | null>(null);

  const { propertyCoordinates, amenities, counts } = data;

  const filteredAmenities = useMemo(() => {
    if (selectedCategory === 'all') return amenities;
    return amenities.filter((a) => a.category === selectedCategory);
  }, [amenities, selectedCategory]);

  if (!propertyCoordinates) return null;

  const center: [number, number] = [
    propertyCoordinates.latitude,
    propertyCoordinates.longitude,
  ];

  return (
    <div className="space-y-6">
      {/* Category filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            selectedCategory === 'all'
              ? 'bg-navy-800 text-cream-100 border-navy-800 shadow-sm'
              : 'bg-white text-navy-700 border-navy-200 hover:border-navy-400'
          }`}
        >
          All Amenities ({counts.total})
        </button>
        <button
          onClick={() => setSelectedCategory('education')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            selectedCategory === 'education'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white text-blue-700 border-blue-200 hover:border-blue-400'
          }`}
        >
          🎓 Schools & Colleges ({counts.education})
        </button>
        <button
          onClick={() => setSelectedCategory('healthcare')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            selectedCategory === 'healthcare'
              ? 'bg-red-600 text-white border-red-600 shadow-sm'
              : 'bg-white text-red-700 border-red-200 hover:border-red-400'
          }`}
        >
          🏥 Healthcare & Hospitals ({counts.healthcare})
        </button>
        <button
          onClick={() => setSelectedCategory('shopping')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            selectedCategory === 'shopping'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-white text-amber-700 border-amber-200 hover:border-amber-400'
          }`}
        >
          🛍️ Shopping & Malls ({counts.shopping})
        </button>
        <button
          onClick={() => setSelectedCategory('transit')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            selectedCategory === 'transit'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-white text-emerald-700 border-emerald-200 hover:border-emerald-400'
          }`}
        >
          🚇 Transit & Metro ({counts.transit})
        </button>
      </div>

      {/* Interactive Map */}
      <div className="relative w-full h-80 sm:h-96 rounded-xl overflow-hidden border border-navy-200 shadow-inner bg-cream-100 z-0">
        <MapContainer
          center={center}
          zoom={14}
          scrollWheelZoom={false}
          className="w-full h-full"
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Search Radius Circle (3 km) */}
          <Circle
            center={center}
            radius={3000}
            pathOptions={{
              color: '#1B2A4A',
              fillColor: '#1B2A4A',
              fillOpacity: 0.04,
              weight: 1,
              dashArray: '4, 4',
            }}
          />

          {/* Property Marker (Prominent) */}
          <Marker position={center} icon={PROPERTY_ICON}>
            <Popup>
              <div className="text-xs p-1">
                <span className="font-bold text-navy-900 block">{propertyName}</span>
                <span className="text-navy-600">Property Location</span>
              </div>
            </Popup>
          </Marker>

          {/* Amenity Markers */}
          {filteredAmenities.map((amenity) => (
            <Marker
              key={amenity.id}
              position={[amenity.latitude, amenity.longitude]}
              icon={getCategoryIcon(amenity.category)}
              eventHandlers={{
                click: () => setSelectedAmenityId(amenity.id),
              }}
            >
              <Popup>
                <div className="text-xs p-1 space-y-1">
                  <span className="font-bold text-navy-900 block">{amenity.name}</span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-navy-500 capitalize">{amenity.categoryLabel}</span>
                    <span className="font-semibold text-navy-700">~{amenity.distanceKm} km</span>
                  </div>
                  <p className="text-[10px] text-navy-400">Approximate straight-line distance</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Categorized Places List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-navy-800 text-sm">
            Nearby Places ({filteredAmenities.length})
          </h3>
          <span className="text-[11px] text-navy-500 italic">
            * All distances are approximate straight-line distances
          </span>
        </div>

        {data.isUnavailable ? (
          <div className="bg-cream-100 border border-navy-200 rounded-xl p-5 text-center text-xs text-navy-600 space-y-1">
            <p className="font-medium text-navy-800">Nearby facilities data temporarily unavailable</p>
            <p className="text-navy-500">Public OpenStreetMap services are currently busy. You can use the Refresh button above to retry.</p>
          </div>
        ) : filteredAmenities.length === 0 ? (
          <div className="bg-cream-100 rounded-xl p-6 text-center text-sm text-navy-500">
            No {selectedCategory !== 'all' ? selectedCategory : ''} amenities found within 3 km.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
            {filteredAmenities.map((amenity: NearbyAmenity) => {
              const isSelected = selectedAmenityId === amenity.id;
              return (
                <div
                  key={amenity.id}
                  onClick={() => setSelectedAmenityId(amenity.id)}
                  className={`p-3 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-navy-700 bg-navy-50'
                      : 'border-navy-100 bg-white hover:bg-cream-100/60'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <p className="font-medium text-navy-900 truncate">{amenity.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${getCategoryBadgeClass(amenity.category)}`}>
                        {amenity.categoryLabel}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-semibold text-navy-800 block text-xs">
                      ~{amenity.distanceKm} km
                    </span>
                    <span className="text-[9px] text-navy-400 uppercase">Approx</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Attribution & Notice */}
      <div className="text-[11px] text-navy-400 pt-2 border-t border-navy-100 flex flex-col sm:flex-row justify-between gap-1">
        <span>
          Data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap</a> contributors, ODbL 1.0 via Overpass API.
        </span>
        <span className="text-navy-500">
          Approximate straight-line distance, not driving time or road distance.
        </span>
      </div>
    </div>
  );
}
