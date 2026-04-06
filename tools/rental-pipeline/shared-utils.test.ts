import { describe, expect, it } from 'vitest';
import { averageNumbers, uniqueStrings } from './collections';
import { normalizeCommunities } from './communityData';
import { toStableSlug } from './slug';

describe('shared utils', () => {
  it('deduplicates strings while dropping empty values', () => {
    expect(uniqueStrings(['双南', '', '双南', '电梯'])).toEqual(['双南', '电梯']);
  });

  it('calculates average with fixed precision', () => {
    expect(averageNumbers([1, 2, 2])).toBe(1.67);
    expect(averageNumbers([])).toBeNull();
  });

  it('creates stable slug for chinese names', () => {
    expect(toStableSlug(' 国年路25弄 ')).toBe('国年路25弄');
    expect(toStableSlug('美岸·栖庭')).toBe('美岸栖庭');
  });

  it('normalizes raw community objects into safe records', () => {
    const communities = normalizeCommunities([
      {
        id: 'demo',
        name: '测试小区',
        coordinates: [121.5, 31.3],
        distance: '1.0km',
        bikeTime: '骑车5分钟',
        price: { min: 5000, max: 6000, unit: '月' },
      },
    ]);

    expect(communities).toHaveLength(1);
    expect(communities[0].name).toBe('测试小区');
    expect(communities[0].layouts).toEqual([]);
  });
});
