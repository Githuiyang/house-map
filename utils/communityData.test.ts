import { describe, expect, it } from 'vitest';
import { normalizeCommunities } from './communityData';

describe('normalizeCommunities', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizeCommunities(null)).toEqual([]);
    expect(normalizeCommunities(undefined)).toEqual([]);
    expect(normalizeCommunities('string')).toEqual([]);
    expect(normalizeCommunities({})).toEqual([]);
  });

  it('returns empty array for empty array input', () => {
    expect(normalizeCommunities([])).toEqual([]);
  });

  it('normalizes a single community with all fields', () => {
    const input = [{
      id: 'test-1',
      name: '测试小区',
      coordinates: [121.5, 31.3],
      distance: '1.5km',
      bikeTime: '8min',
      price: { min: 1000, max: 3000, unit: '月' },
      floorTypes: ['低层'],
      layouts: ['一室一厅'],
      elevator: true,
      highlights: ['近地铁'],
      warnings: ['老旧'],
      contributor: 'test',
      updatedAt: '2026-04-30',
      roomPricing: [{ layout: '一室一厅', shared: 1500, whole: 3000 }],
      pricePerRoomStats: { min: 1500, max: 3000, avg: 2250 },
    }];

    const result = normalizeCommunities(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('test-1');
    expect(result[0].name).toBe('测试小区');
    expect(result[0].commute).toBeDefined();
    expect(result[0].commute!.distanceKm).toBeGreaterThan(0);
    expect(result[0].commute!.bikeMinutes).toBeGreaterThan(0);
  });

  it('handles community with missing optional fields', () => {
    const input = [{
      id: 'test-2',
      name: '简略小区',
    }];

    const result = normalizeCommunities(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('test-2');
    expect(result[0].name).toBe('简略小区');
    expect(result[0].coordinates).toEqual([0, 0]);
    expect(result[0].elevator).toBe(false);
    expect(result[0].layouts).toEqual([]);
    expect(result[0].roomPricing).toEqual([]);
  });

  it('normalizes multiple communities', () => {
    const input = [
      { id: 'a', name: 'A小区' },
      { id: 'b', name: 'B小区' },
    ];
    const result = normalizeCommunities(input);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('A小区');
    expect(result[1].name).toBe('B小区');
  });
});
