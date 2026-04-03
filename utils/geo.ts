import type { CommuteInfo } from '@/types/community';

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

// 通勤估算：道路距离 ≈ 直线距离 × 1.3，步行 12min/km，骑行 5min/km
const ROAD_DISTANCE_FACTOR = 1.3;
const WALK_MINUTES_PER_KM = 12;
const BIKE_MINUTES_PER_KM = 5;

export function estimateCommute(
  from: [number, number],
  to: [number, number]
): CommuteInfo {
  const straightLineMeters = calculateDistanceMeters(from, to);
  const straightLineKm = straightLineMeters / 1000;
  const roadKm = straightLineKm * ROAD_DISTANCE_FACTOR;
  return {
    distanceKm: Math.round(straightLineKm * 10) / 10,
    roadDistanceKm: Math.round(roadKm * 10) / 10,
    walkMinutes: Math.max(1, Math.ceil(roadKm * WALK_MINUTES_PER_KM)),
    bikeMinutes: Math.max(1, Math.ceil(roadKm * BIKE_MINUTES_PER_KM)),
  };
}

export function normalizeLngLat(coords: [number, number]): [number, number] | null {
  const [a, b] = coords;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  const normalized: [number, number] = Math.abs(a) <= 90 && Math.abs(b) > 90 ? [b, a] : [a, b];
  const [lng, lat] = normalized;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return normalized;
}
