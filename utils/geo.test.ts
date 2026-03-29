import { describe, expect, it } from 'vitest';
import { calculateDistanceMeters, normalizeLngLat } from './geo';

describe('normalizeLngLat', () => {
  it('returns same coords for valid lng/lat', () => {
    expect(normalizeLngLat([121.5, 31.3])).toEqual([121.5, 31.3]);
  });

  it('swaps when input looks like lat/lng', () => {
    expect(normalizeLngLat([31.3, 121.5])).toEqual([121.5, 31.3]);
  });

  it('returns null for invalid numbers', () => {
    expect(normalizeLngLat([NaN, 31.3] as unknown as [number, number])).toBeNull();
    expect(normalizeLngLat([121.5, Infinity] as unknown as [number, number])).toBeNull();
  });

  it('returns null for out-of-range lng/lat', () => {
    expect(normalizeLngLat([200, 31.3])).toBeNull();
    expect(normalizeLngLat([121.5, 120])).toBeNull();
  });
});

describe('calculateDistanceMeters', () => {
  it('returns 0 for identical points', () => {
    expect(calculateDistanceMeters([121.5, 31.3], [121.5, 31.3])).toBe(0);
  });

  it('is symmetric', () => {
    const a: [number, number] = [121.512568, 31.304715];
    const b: [number, number] = [121.522568, 31.314715];
    expect(calculateDistanceMeters(a, b)).toBeCloseTo(calculateDistanceMeters(b, a), 6);
  });

  it('roughly matches small deltas scale', () => {
    const base: [number, number] = [121.5, 31.3];
    const movedLat: [number, number] = [121.5, 31.31];
    const d = calculateDistanceMeters(base, movedLat);
    expect(d).toBeGreaterThan(900);
    expect(d).toBeLessThan(1300);
  });
});
