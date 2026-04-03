import { type Community, createDefaultCommunity } from '@/types/community';
import { estimateCommute } from '@/utils/geo';
import { COMPANY_COORDS } from '@/utils/constants';

export function normalizeCommunities(data: unknown): Community[] {
  if (!Array.isArray(data)) return [];
  return data.map(item => {
    const coords: [number, number] = item.coordinates || [0, 0];
    const commute = estimateCommute(COMPANY_COORDS, coords);
    return createDefaultCommunity({
      id: item.id,
      name: item.name,
      coordinates: coords,
      distance: item.distance,
      bikeTime: item.bikeTime,
      commute,
      price: item.price,
      floorTypes: item.floorTypes,
      layouts: item.layouts,
      elevator: item.elevator,
      highlights: item.highlights,
      warnings: item.warnings,
      contributor: item.contributor,
      updatedAt: item.updatedAt,
    });
  });
}
