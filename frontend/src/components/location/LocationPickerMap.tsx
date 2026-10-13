import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Vite asset bundling for default Leaflet marker icons
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Default Ahmedabad coordinates for initial map viewport when no coordinates exist
const AHMEDABAD_CENTER: [number, number] = [23.0225, 72.5714];

interface LocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
  disabled?: boolean;
}

// Inner helper component to pan/fly map when external lat/lng change
function MapCenterController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, map.getZoom(), { duration: 0.8 });
  }, [center[0], center[1], map]);
  return null;
}

// Inner helper component to handle map clicks
function MapClickHandler({
  onLocationSelect,
  disabled,
}: {
  onLocationSelect: (lat: number, lng: number) => void;
  disabled?: boolean;
}) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      // Round to 6 decimal places (~0.1m precision)
      const lat = parseFloat(e.latlng.lat.toFixed(6));
      const lng = parseFloat(e.latlng.lng.toFixed(6));
      onLocationSelect(lat, lng);
    },
  });
  return null;
}

export default function LocationPickerMap({
  latitude,
  longitude,
  onChange,
  disabled = false,
}: LocationPickerMapProps) {
  const hasCoordinates =
    typeof latitude === 'number' &&
    !isNaN(latitude) &&
    typeof longitude === 'number' &&
    !isNaN(longitude);

  const position: [number, number] | null = hasCoordinates
    ? [latitude as number, longitude as number]
    : null;

  const centerPosition: [number, number] = position || AHMEDABAD_CENTER;

  // Draggable marker handlers
  const markerRef = useRef<L.Marker | null>(null);
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const latLng = marker.getLatLng();
          const lat = parseFloat(latLng.lat.toFixed(6));
          const lng = parseFloat(latLng.lng.toFixed(6));
          onChange(lat, lng);
        }
      },
    }),
    [onChange]
  );

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-xs text-navy-600">
        <span className="font-medium">
          {hasCoordinates
            ? '📍 Pin placed. Click map or drag pin to fine-tune position.'
            : 'Click anywhere on the map to set property location pin.'}
        </span>
        {hasCoordinates && !disabled && (
          <span className="text-navy-500 font-mono">
            {latitude?.toFixed(4)}, {longitude?.toFixed(4)}
          </span>
        )}
      </div>

      <div className="relative w-full h-64 sm:h-80 rounded-xl overflow-hidden border border-navy-200 shadow-inner bg-cream-100 z-0">
        <MapContainer
          center={centerPosition}
          zoom={hasCoordinates ? 15 : 12}
          scrollWheelZoom={false}
          className="w-full h-full"
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler onLocationSelect={onChange} disabled={disabled} />

          {position && (
            <>
              <MapCenterController center={position} />
              <Marker
                draggable={!disabled}
                eventHandlers={eventHandlers}
                position={position}
                ref={markerRef}
              />
            </>
          )}
        </MapContainer>

        {disabled && (
          <div className="absolute inset-0 bg-navy-900/10 backdrop-blur-[1px] pointer-events-none z-[1000]" />
        )}
      </div>
      <p className="text-[11px] text-navy-400">
        Tiles &copy; OpenStreetMap contributors. Coordinates update automatically.
      </p>
    </div>
  );
}
