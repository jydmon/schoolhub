// Keyless forward-geocoding via OpenStreetMap Nominatim. Turns a stop address
// (or name + town) into lat/lng so transport stops appear on the live maps.
// No API key or account required. Nominatim's usage policy asks for a valid
// User-Agent and at most ~1 request/second — callers batch politely.

export type GeoResult = { lat: number; lng: number } | null;

const cache = new Map<string, GeoResult>();

export function looksLikeLatLng(s: string): GeoResult {
  const m = s.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export async function geocode(query: string): Promise<GeoResult> {
  const q = query.trim();
  if (!q) return null;
  const direct = looksLikeLatLng(q);
  if (direct) return direct;
  if (cache.has(q)) return cache.get(q)!;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": "SIPlat-SchoolPlatform/1.0 (transport stop geocoding)", Accept: "application/json" } });
    if (!res.ok) { cache.set(q, null); return null; }
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    const r: GeoResult = first && first.lat && first.lon ? { lat: parseFloat(first.lat), lng: parseFloat(first.lon) } : null;
    cache.set(q, r);
    return r;
  } catch {
    return null;
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
