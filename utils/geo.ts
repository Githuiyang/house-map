export function calculateDistanceMeters(coord1: [number, number], coord2: [number, number]): number {
  const R = 6371000;
  const lat1 = (coord1[1] * Math.PI) / 180;
  const lat2 = (coord2[1] * Math.PI) / 180;
  const deltaLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const deltaLon = ((coord2[0] - coord1[0]) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function normalizeLngLat(coords: [number, number]): [number, number] | null {
  const [a, b] = coords;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  const normalized: [number, number] = Math.abs(a) <= 90 && Math.abs(b) > 90 ? [b, a] : [a, b];
  const [lng, lat] = normalized;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return normalized;
}
