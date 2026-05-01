import { describe, it, expect } from 'vitest';
import { buildCommunityCardViewModel } from './communityCardViewModel';
import type { Community } from '@/types/community';

function base(overrides: Partial<Community> = {}): Community {
  return {
    id: 'test',
    name: '测试小区',
    coordinates: [121.5, 31.3],
    distance: '1.0km',
    bikeTime: '骑车5分钟',
    price: { min: 0, max: 0, unit: '月' },
    ...overrides,
  };
}

describe('buildCommunityCardViewModel', () => {
  // ── Shared data ──

  it('无 shared 数据时 hasSharedData = false', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '两室一厅', shared: 0, whole: 5000, rooms: 2 },
      ],
    }));
    expect(vm.hasSharedData).toBe(false);
  });

  it('有 shared 数据时 hasSharedData = true', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '两室一厅', shared: 2500, whole: 5000, rooms: 2 },
      ],
    }));
    expect(vm.hasSharedData).toBe(true);
  });

  // ── One-room pricePerRoom → whole ──

  it('一室 pricePerRoom 被归入整租，不进入单间估算', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '一室一厅', shared: 0, whole: 0, rooms: 1, pricePerRoom: 4200 },
      ],
    }));
    expect(vm.priceRows).toHaveLength(1);
    expect(vm.priceRows[0].whole).toBe(4200);
    expect(vm.priceRows[0].pricePerRoom).toBeNull();
    // badge 应该是 "整租"，不应出现 "单间估算"
    expect(vm.priceBadges).toHaveLength(1);
    expect(vm.priceBadges[0].label).toBe('整租');
    expect(vm.priceBadges[0].price).toBe('4k');
  });

  it('一室 layout 包含"一室"但 rooms 未指定，pricePerRoom 仍归入整租', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '一室一厅', shared: 0, whole: 0, rooms: 1, pricePerRoom: 5500 },
      ],
    }));
    expect(vm.priceRows[0].whole).toBe(5500);
    expect(vm.priceRows[0].pricePerRoom).toBeNull();
  });

  it('一室 whole > 0 时保持原值，pricePerRoom 不被提升', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '一室一厅', shared: 0, whole: 5300, rooms: 1, area: '53平' },
      ],
    }));
    expect(vm.priceRows[0].whole).toBe(5300);
    expect(vm.priceRows[0].pricePerRoom).toBeNull();
  });

  // ── Multi-room pricePerRoom → 单间估算 ──

  it('多室 pricePerRoom 保留为单间估算', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '两室一厅', shared: 0, whole: 5500, rooms: 2, area: '54平', pricePerRoom: 2750 },
      ],
    }));
    expect(vm.priceRows[0].whole).toBe(5500);
    expect(vm.priceRows[0].pricePerRoom).toBe(2750);
  });

  it('多室 whole=0 但 pricePerRoom>0 不提升为 whole', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '三室一厅', shared: 0, whole: 0, rooms: 3, pricePerRoom: 2500 },
      ],
    }));
    expect(vm.priceRows[0].whole).toBeNull();
    expect(vm.priceRows[0].pricePerRoom).toBe(2500);
  });

  // ── Area normalization ──

  it('area "0平" 被转为 null（未知）', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '两房两厅', shared: 0, whole: 16800, rooms: 1, area: '0平' },
      ],
    }));
    expect(vm.priceRows[0].area).toBeNull();
  });

  it('area undefined 被转为 null', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '一室', shared: 0, whole: 5000, rooms: 1 },
      ],
    }));
    expect(vm.priceRows[0].area).toBeNull();
  });

  // ── Highlight classification ──

  it('highlights 被拆成 pros / notes', () => {
    const vm = buildCommunityCardViewModel(base({
      highlights: [
        '南北通透',
        '精装修',
        '来源：自如',
        '有钥匙',
        '看房方便',
      ],
    }));
    expect(vm.pros).toEqual(['南北通透', '精装修']);
    expect(vm.notes).toEqual(['来源：自如', '有钥匙', '看房方便']);
  });

  // ── noPriceRows ──

  it('缺价格行归入 noPriceRows', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '两室一厅', shared: 0, whole: 0, rooms: 2 },
        { layout: '三室一厅', shared: 0, whole: 0, rooms: 3 },
      ],
    }));
    expect(vm.noPriceRows).toHaveLength(2);
    expect(vm.priceRows).toHaveLength(0);
    expect(vm.noPriceRows.map(r => r.layout)).toEqual(['两室一厅', '三室一厅']);
  });

  it('noPriceRows 保留户型列表', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '两室一厅', shared: 0, whole: 5000, rooms: 2, area: '50平' },
        { layout: '三室一厅', shared: 0, whole: 0, rooms: 3 },
      ],
    }));
    expect(vm.priceRows).toHaveLength(1);
    expect(vm.noPriceRows).toHaveLength(1);
    expect(vm.noPriceRows[0].layout).toBe('三室一厅');
  });

  // ── Data warnings ──

  it('缺价格生成 no_price warning', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '两室一厅', shared: 0, whole: 0, rooms: 2 },
        { layout: '三室一厅', shared: 0, whole: 0, rooms: 3 },
      ],
    }));
    const priceWarning = vm.dataWarnings.find(w => w.type === 'no_price');
    expect(priceWarning).toBeDefined();
    expect(priceWarning!.message).toContain('暂无报价');
  });

  it('缺户型生成 no_layout warning', () => {
    const vm = buildCommunityCardViewModel(base({
      layouts: [],
      roomPricing: [],
    }));
    const layoutWarning = vm.dataWarnings.find(w => w.type === 'no_layout');
    expect(layoutWarning).toBeDefined();
  });

  it('缺面积生成 no_area warning', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '一室', shared: 0, whole: 5000, rooms: 1 },
      ],
    }));
    const areaWarning = vm.dataWarnings.find(w => w.type === 'no_area');
    expect(areaWarning).toBeDefined();
  });

  it('outdated 数据生成 warning', () => {
    const vm = buildCommunityCardViewModel(base({ updatedAt: '2020' }));
    const outdatedWarning = vm.dataWarnings.find(w => w.type === 'outdated');
    expect(outdatedWarning).toBeDefined();
    expect(outdatedWarning!.message).toContain('2020');
  });

  it('2026 年数据不生成 outdated warning', () => {
    const vm = buildCommunityCardViewModel(base({ updatedAt: '2026' }));
    const outdatedWarning = vm.dataWarnings.find(w => w.type === 'outdated');
    expect(outdatedWarning).toBeUndefined();
  });

  it('部分有价格部分无价格', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '两室一厅', shared: 0, whole: 5000, rooms: 2, area: '50平' },
        { layout: '三室一厅', shared: 0, whole: 0, rooms: 3 },
      ],
    }));
    expect(vm.priceRows).toHaveLength(1);
    expect(vm.noPriceRows).toHaveLength(1);
    const priceWarning = vm.dataWarnings.find(w => w.type === 'no_price');
    expect(priceWarning).toBeDefined();
    expect(priceWarning!.message).toContain('1 个户型暂无报价');
  });

  it('空 roomPricing 不生成 no_price warning', () => {
    const vm = buildCommunityCardViewModel(base({ roomPricing: [] }));
    const priceWarning = vm.dataWarnings.find(w => w.type === 'no_price');
    expect(priceWarning).toBeUndefined();
  });

  // ── Price badges ──

  it('整租 badge 范围格式化', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '一室一厅', shared: 0, whole: 4500, rooms: 1, area: '41平' },
        { layout: '三室一厅', shared: 0, whole: 7500, rooms: 3, area: '60平', pricePerRoom: 2500 },
      ],
    }));
    const wholeBadge = vm.priceBadges.find(b => b.label === '整租');
    expect(wholeBadge).toBeDefined();
    expect(wholeBadge!.price).toBe('5k-8k');
    expect(wholeBadge!.unit).toBe('/月');

    const pprBadge = vm.priceBadges.find(b => b.label === '单间估算');
    expect(pprBadge).toBeDefined();
    expect(pprBadge!.price).toBe('3k');
  });

  it('整租 badge 相同价格无范围', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '一室一厅', shared: 0, whole: 5500, rooms: 1, area: '44平' },
      ],
    }));
    expect(vm.priceBadges).toHaveLength(1);
    expect(vm.priceBadges[0].label).toBe('整租');
    expect(vm.priceBadges[0].price).toBe('6k');
  });

  it('一室 pricePerRoom 进整租 badge，不进单间估算 badge', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '一室一厅', shared: 0, whole: 0, rooms: 1, pricePerRoom: 5500 },
      ],
    }));
    const wholeBadge = vm.priceBadges.find(b => b.label === '整租');
    expect(wholeBadge).toBeDefined();
    expect(wholeBadge!.price).toBe('6k');
    const pprBadge = vm.priceBadges.find(b => b.label === '单间估算');
    expect(pprBadge).toBeUndefined();
  });

  it('多室 pricePerRoom 进单间估算 badge', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '两室一厅', shared: 0, whole: 5000, rooms: 2, area: '50平', pricePerRoom: 2500 },
        { layout: '三室一厅', shared: 0, whole: 7500, rooms: 3, area: '60平', pricePerRoom: 2500 },
      ],
    }));
    const pprBadge = vm.priceBadges.find(b => b.label === '单间估算');
    expect(pprBadge).toBeDefined();
    expect(pprBadge!.price).toBe('3k');
  });

  it('同时有整租 badge 和单间估算 badge', () => {
    const vm = buildCommunityCardViewModel(base({
      roomPricing: [
        { layout: '一室一厅', shared: 0, whole: 4700, rooms: 1, area: '44平' },
        { layout: '两室一厅', shared: 0, whole: 6400, rooms: 2, area: '56平', pricePerRoom: 3200 },
      ],
    }));
    expect(vm.priceBadges).toHaveLength(2);
    expect(vm.priceBadges.map(b => b.label)).toEqual(['整租', '单间估算']);
  });

  // ── Commute / facts ──

  it('commute 信息正确传递', () => {
    const vm = buildCommunityCardViewModel(base({
      commute: {
        distanceKm: 1.5,
        roadDistanceKm: 1.8,
        walkMinutes: 22,
        bikeMinutes: 8,
      },
    }));
    expect(vm.commuteSummary.roadDistanceKm).toBe(1.8);
    expect(vm.commuteSummary.walkMinutes).toBe(22);
    expect(vm.commuteSummary.bikeMinutes).toBe(8);
  });

  it('factChips 包含楼层类型和电梯', () => {
    const vm = buildCommunityCardViewModel(base({
      floorTypes: ['高层', '新楼'],
      elevator: true,
    }));
    expect(vm.factChips).toEqual(['高层', '新楼', '有电梯']);
  });

  it('无 floorTypes 无电梯时 factChips 为空', () => {
    const vm = buildCommunityCardViewModel(base({
      floorTypes: [],
      elevator: false,
    }));
    expect(vm.factChips).toEqual([]);
  });
});
