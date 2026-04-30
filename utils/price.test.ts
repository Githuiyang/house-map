import { describe, expect, it } from 'vitest';
import { formatK, formatPricePerRoom } from './price';

describe('formatK', () => {
  it('returns raw number string for values under 1000', () => {
    expect(formatK(800)).toBe('800');
    expect(formatK(0)).toBe('0');
    expect(formatK(999)).toBe('999');
  });

  it('returns k format for values >= 1000', () => {
    expect(formatK(1000)).toBe('1k');
    expect(formatK(3500)).toBe('4k');
    expect(formatK(1500)).toBe('2k');
  });

  it('rounds to nearest k', () => {
    expect(formatK(1499)).toBe('1k');
    expect(formatK(1500)).toBe('2k');
    expect(formatK(2500)).toBe('3k');
  });
});

describe('formatPricePerRoom', () => {
  it('returns null for undefined', () => {
    expect(formatPricePerRoom(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(formatPricePerRoom(null as unknown as undefined)).toBeNull();
  });

  it('formats sub-1000 values with yuan', () => {
    expect(formatPricePerRoom(800)).toBe('单间均价 ¥800/月');
    expect(formatPricePerRoom(999)).toBe('单间均价 ¥999/月');
  });

  it('formats >= 1000 values with k', () => {
    expect(formatPricePerRoom(1000)).toBe('单间均价 ¥1k/月');
    expect(formatPricePerRoom(3500)).toBe('单间均价 ¥4k/月');
  });

  it('rounds >= 1000 values to nearest k', () => {
    expect(formatPricePerRoom(1499)).toBe('单间均价 ¥1k/月');
    expect(formatPricePerRoom(1500)).toBe('单间均价 ¥2k/月');
  });
});
