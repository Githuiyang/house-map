import { createDefaultCommunity, type Community } from '@/types/community';

export function normalizeCommunities(data: unknown): Community[] {
  if (!Array.isArray(data)) return [];
  return data.map(item => createDefaultCommunity({
    id: item.id,
    name: item.name,
    coordinates: item.coordinates,
    distance: item.distance,
    bikeTime: item.bikeTime,
    price: item.price,
    floorTypes: item.floorTypes,
    layouts: item.layouts,
    elevator: item.elevator,
    highlights: item.highlights,
    warnings: item.warnings,
    contributor: item.contributor,
    updatedAt: item.updatedAt,
  }));
}
