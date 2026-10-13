import axios from 'axios';

export interface NearbyAmenity {
  id: string;
  name: string;
  category: 'education' | 'healthcare' | 'shopping' | 'transit';
  categoryLabel: string;
  latitude: number;
  longitude: number;
  distanceKm: number; // Straight-line distance in km rounded to 2 decimal places
  type: string; // e.g., 'school', 'hospital', 'mall', 'bus_station'
}

export interface NearbyAmenitiesResponse {
  propertyCoordinates: {
    latitude: number;
    longitude: number;
  };
  searchRadiusKm: number;
  amenities: NearbyAmenity[];
  counts: {
    education: number;
    healthcare: number;
    shopping: number;
    transit: number;
    total: number;
  };
  cached: boolean;
  attribution: string;
  isUnavailable?: boolean;
  message?: string;
}

// In-memory cache: key = `${lat.toFixed(3)},${lng.toFixed(3)}_${radiusKm}`
interface CacheEntry {
  data: NearbyAmenitiesResponse;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

// Haversine formula for approximate straight-line distance
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return parseFloat(d.toFixed(2));
}

// Build Overpass QL query:
// - Supports node and way elements
// - Uses `out center` (WITHOUT the `tags` modifier, which in Overpass strips node lat/lon coordinates)
function buildOverpassQuery(lat: number, lon: number, radiusMeters: number): string {
  return `[out:json][timeout:6][maxsize:2097152];(
    node["amenity"~"hospital|clinic|pharmacy|school|college|university|bus_station"](around:${radiusMeters},${lat},${lon});
    way["amenity"~"school|college|university|hospital"](around:${radiusMeters},${lat},${lon});
    node["shop"~"supermarket|mall|convenience|department_store"](around:${radiusMeters},${lat},${lon});
    way["shop"~"supermarket|mall"](around:${radiusMeters},${lat},${lon});
    node["railway"~"station|subway_entrance"](around:${radiusMeters},${lat},${lon});
  );out center 45 qt;`;
}

function categorizeElement(tags: Record<string, string>): {
  category: 'education' | 'healthcare' | 'shopping' | 'transit';
  categoryLabel: string;
  type: string;
} | null {
  if (tags.amenity === 'school' || tags.amenity === 'college' || tags.amenity === 'university') {
    return {
      category: 'education',
      categoryLabel: 'Schools & Colleges',
      type: tags.amenity,
    };
  }
  if (tags.amenity === 'hospital' || tags.amenity === 'clinic' || tags.amenity === 'pharmacy') {
    return {
      category: 'healthcare',
      categoryLabel: 'Hospitals & Healthcare',
      type: tags.amenity,
    };
  }
  if (
    tags.shop === 'mall' ||
    tags.shop === 'supermarket' ||
    tags.shop === 'department_store' ||
    tags.shop === 'convenience' ||
    tags.amenity === 'marketplace'
  ) {
    return {
      category: 'shopping',
      categoryLabel: 'Shopping & Malls',
      type: tags.shop || tags.amenity,
    };
  }
  if (
    tags.railway === 'station' ||
    tags.railway === 'subway_entrance' ||
    tags.public_transport === 'station' ||
    tags.amenity === 'bus_station'
  ) {
    return {
      category: 'transit',
      categoryLabel: 'Transit & Metro',
      type: tags.railway || tags.public_transport || tags.amenity,
    };
  }
  return null;
}

export async function fetchNearbyAmenities(
  latitude: number,
  longitude: number,
  radiusKm = 3
): Promise<NearbyAmenitiesResponse> {
  const boundedRadiusKm = Math.min(Math.max(radiusKm, 1), 5);
  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}_${boundedRadiusKm}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return { ...cached.data, cached: true };
  }

  const radiusMeters = Math.round(boundedRadiusKm * 1000);
  const query = buildOverpassQuery(latitude, longitude, radiusMeters);

  // Primary reliable global Overpass endpoint
  const OVERPASS_ENDPOINT = 'https://overpass.openstreetmap.fr/api/interpreter';

  let responseData: any = null;

  try {
    const response = await axios({
      method: 'post',
      url: OVERPASS_ENDPOINT,
      data: query,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'text/plain',
        'User-Agent': 'ThePlinthApp/1.0 (Ahmedabad; contact: devraval@theplinth.local)',
      },
      timeout: 10000,
    });
    if (response.data && Array.isArray(response.data.elements)) {
      responseData = response.data;
    }
  } catch {
    // If upstream times out or fails, gracefully fall back
  }

  // Graceful fallback if Overpass servers are temporarily unavailable or overloaded
  if (!responseData) {
    const fallbackResponse: NearbyAmenitiesResponse = {
      propertyCoordinates: { latitude, longitude },
      searchRadiusKm: boundedRadiusKm,
      amenities: [],
      counts: {
        education: 0,
        healthcare: 0,
        shopping: 0,
        transit: 0,
        total: 0,
      },
      cached: false,
      attribution: 'Data © OpenStreetMap contributors. Overpass API temporarily unavailable.',
      isUnavailable: true,
      message: 'Nearby facilities are temporarily unavailable. Please try again later.',
    };

    // Cache negative result briefly (30s) to protect against immediate retry bursts
    cache.set(cacheKey, {
      data: fallbackResponse,
      expiresAt: now + 30 * 1000,
    });

    return fallbackResponse;
  }

  const elements = responseData.elements || [];
  const amenities: NearbyAmenity[] = [];
  const seenNames = new Set<string>();

  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name || tags['name:en'] || tags['name:hi'] || tags['name:gu'];
    if (!name) continue; // Skip unnamed items

    const catInfo = categorizeElement(tags);
    if (!catInfo) continue;

    // For nodes: el.lat / el.lon
    // For ways: el.center.lat / el.center.lon (from `out center`)
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;

    const distanceKm = calculateHaversineDistanceKm(latitude, longitude, lat, lon);
    if (distanceKm > boundedRadiusKm) continue; // Must be within search radius

    const dedupKey = `${catInfo.category}:${name.toLowerCase()}`;
    if (seenNames.has(dedupKey)) continue;
    seenNames.add(dedupKey);

    amenities.push({
      id: `${el.type || 'node'}_${el.id}`,
      name,
      category: catInfo.category,
      categoryLabel: catInfo.categoryLabel,
      latitude: lat,
      longitude: lon,
      distanceKm,
      type: catInfo.type,
    });
  }

  // Sort ascending by distance (nearest first)
  amenities.sort((a, b) => a.distanceKm - b.distanceKm);

  const counts = {
    education: amenities.filter((a) => a.category === 'education').length,
    healthcare: amenities.filter((a) => a.category === 'healthcare').length,
    shopping: amenities.filter((a) => a.category === 'shopping').length,
    transit: amenities.filter((a) => a.category === 'transit').length,
    total: amenities.length,
  };

  const result: NearbyAmenitiesResponse = {
    propertyCoordinates: { latitude, longitude },
    searchRadiusKm: boundedRadiusKm,
    amenities,
    counts,
    cached: false,
    attribution: 'Data © OpenStreetMap contributors, ODbL 1.0 via Overpass API. Approximate straight-line distances.',
    isUnavailable: false,
  };

  // Cache successful result for 1 hour
  cache.set(cacheKey, {
    data: result,
    expiresAt: now + CACHE_TTL_MS,
  });

  return result;
}
