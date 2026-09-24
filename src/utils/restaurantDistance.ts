/**
 * Honest, non-fabricated distance for the restaurant dataset. The dataset
 * only records a `city` string per restaurant (see data/restaurants.ts), so
 * "distance" here is deliberately an approximate distance to that city's
 * public, well-known centroid — never a fake precise "2.3km away" for an
 * individual restaurant address we don't actually have. "Near Me" only
 * activates this after the browser's real geolocation permission is
 * granted; it is never silently assumed.
 */

const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  'Tel Aviv': { lat: 32.0853, lon: 34.7818 },
  Jaffa: { lat: 32.0533, lon: 34.75 },
  Herzliya: { lat: 32.1663, lon: 34.8434 },
  'Ramat Gan': { lat: 32.0684, lon: 34.8248 },
};

export interface Coordinates {
  lat: number;
  lon: number;
}

/** Haversine great-circle distance in kilometers between two coordinates. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Approximate distance from the user's real coordinates to a restaurant's city centroid — null if the city isn't in the known list. */
export function approxDistanceToCityKm(userCoords: Coordinates, city: string): number | null {
  const coords = CITY_COORDS[city];
  if (!coords) return null;
  return Math.round(haversineKm(userCoords, coords) * 10) / 10;
}

export type GeolocationResult = { status: 'granted'; coords: Coordinates } | { status: 'denied' | 'unavailable' };

/** Wraps the real browser Geolocation API — never returns fabricated coordinates. */
export function requestBrowserLocation(): Promise<GeolocationResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ status: 'unavailable' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ status: 'granted', coords: { lat: pos.coords.latitude, lon: pos.coords.longitude } }),
      () => resolve({ status: 'denied' }),
      { timeout: 8000 },
    );
  });
}
