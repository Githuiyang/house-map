import type { Community, RoomPricing } from '@/types/community';

// ── Output types ──────────────────────────────────────────────

export interface PriceRow {
  layout: string;
  area: string | null;       // null = 未知
  whole: number | null;      // null = 无报价（包含一居整租）
  pricePerRoom: number | null; // 仅多室户型的单间估算
  note: string | null;
  hasAnyPrice: boolean;
}

export interface PriceBadge {
  label: string;   // "整租" / "一居" / "单间估算"
  price: string;   // "5k-8k" / "4.2k"
  unit: string;    // "/月"
}

export interface DataWarning {
  type: 'no_price' | 'no_layout' | 'no_area' | 'outdated';
  message: string;
}

export interface CommunityCardViewModel {
  name: string;
  commuteSummary: {
    roadDistanceKm: number | null;
    walkMinutes: number | null;
    bikeMinutes: number | null;
    distance: string;
    bikeTime: string;
  };
  priceBadges: PriceBadge[];
  hasSharedData: boolean;
  priceRows: PriceRow[];
  noPriceRows: PriceRow[];
  layoutTags: string[];
  factChips: string[];
  pros: string[];
  cons: string[];
  notes: string[];
  dataWarnings: DataWarning[];
  contributor: string;
  updatedAt: string;
}

// ── Highlight classification ──────────────────────────────────

const NOTE_KEYWORDS = [
  '来源', '自如', '有钥匙', '约看房', '看房方便', '看房',
  '随时入住', '可办车位', '限时垃圾分类', '随便扔',
];

// ── Helper ────────────────────────────────────────────────────

function formatPriceK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
}

function isNoteHighlight(text: string): boolean {
  return NOTE_KEYWORDS.some(kw => text.includes(kw));
}

function normalizeArea(area: string | undefined): string | null {
  if (!area) return null;
  if (area === '0平') return null;
  return area;
}

/** 一室/一房户型：rooms===1 或 layout 包含 "一室"/"一房" */
function isOneRoomLayout(r: RoomPricing): boolean {
  if (r.rooms === 1) return true;
  if (r.layout?.includes('一室') || r.layout?.includes('一房')) return true;
  return false;
}

// ── Main ──────────────────────────────────────────────────────

export function buildCommunityCardViewModel(community: Community): CommunityCardViewModel {
  const rp = community.roomPricing ?? [];

  // hasSharedData
  const hasSharedData = rp.some(r => r.shared > 0);

  // Classify highlights → pros / notes
  const allHighlights = community.highlights ?? [];
  const pros: string[] = [];
  const notes: string[] = [];
  for (const h of allHighlights) {
    if (isNoteHighlight(h)) {
      notes.push(h);
    } else {
      pros.push(h);
    }
  }

  // ── Price rows ───────────────────────────────────────────
  // 规则：
  //   一室 whole=0 但 pricePerRoom>0 → pricePerRoom 提升为 whole（一居整租）
  //   多室 pricePerRoom → 保留为单间估算
  const priceRows: PriceRow[] = [];
  const noPriceRows: PriceRow[] = [];

  // 收集各类价格用于 badge
  const wholePrices: number[] = [];     // 整租价（含一居）
  const multiPprPrices: number[] = [];  // 多室单间估算

  for (const r of rp) {
    const area = normalizeArea(r.area);
    const oneRoom = isOneRoomLayout(r);

    let whole: number | null = r.whole > 0 ? r.whole : null;
    let ppr: number | null = (r.pricePerRoom ?? 0) > 0 ? r.pricePerRoom! : null;

    // 一室 pricePerRoom 提升为整租价
    if (oneRoom && whole === null && ppr !== null) {
      whole = ppr;
      ppr = null;
    }

    // 多室 pricePerRoom 保留为单间估算
    if (!oneRoom && ppr !== null) {
      multiPprPrices.push(ppr);
    }

    if (whole !== null) {
      wholePrices.push(whole);
    }

    const hasAnyPrice = (whole !== null) || (ppr !== null);
    const row: PriceRow = {
      layout: r.layout,
      area,
      whole,
      pricePerRoom: ppr,
      note: r.note ?? null,
      hasAnyPrice,
    };

    if (hasAnyPrice) {
      priceRows.push(row);
    } else {
      noPriceRows.push(row);
    }
  }

  // ── Price badges ─────────────────────────────────────────
  const priceBadges: PriceBadge[] = [];

  // 整租 badge（含一居）
  if (wholePrices.length > 0) {
    const min = Math.min(...wholePrices);
    const max = Math.max(...wholePrices);
    const priceStr = min === max
      ? formatPriceK(min)
      : `${formatPriceK(min)}-${formatPriceK(max)}`;
    priceBadges.push({ label: '整租', price: priceStr, unit: '/月' });
  }

  // 多室单间估算 badge
  if (multiPprPrices.length > 0) {
    const min = Math.min(...multiPprPrices);
    const max = Math.max(...multiPprPrices);
    const priceStr = min === max
      ? formatPriceK(min)
      : `${formatPriceK(min)}-${formatPriceK(max)}`;
    priceBadges.push({ label: '单间估算', price: priceStr, unit: '/月' });
  }

  // ── Layout tags ──────────────────────────────────────────
  const layoutTags = community.layouts ?? [];

  // ── Fact chips ───────────────────────────────────────────
  const factChips: string[] = [];
  for (const ft of community.floorTypes ?? []) {
    factChips.push(ft);
  }
  if (community.elevator) {
    factChips.push('有电梯');
  }

  // ── Data warnings ────────────────────────────────────────
  const dataWarnings: DataWarning[] = [];

  if (rp.length > 0 && noPriceRows.length === rp.length) {
    dataWarnings.push({ type: 'no_price', message: '已知户型，暂无报价' });
  } else if (noPriceRows.length > 0) {
    dataWarnings.push({
      type: 'no_price',
      message: `${noPriceRows.length} 个户型暂无报价`,
    });
  }

  if (layoutTags.length === 0 && rp.length === 0) {
    dataWarnings.push({ type: 'no_layout', message: '户型信息未知' });
  }

  const areaUnknown = rp.filter(r => normalizeArea(r.area) === null);
  if (rp.length > 0 && areaUnknown.length === rp.length) {
    dataWarnings.push({ type: 'no_area', message: '面积信息未知' });
  }

  const year = parseInt(community.updatedAt ?? '0', 10);
  if (year > 0 && year < 2024) {
    dataWarnings.push({ type: 'outdated', message: `数据更新于 ${community.updatedAt}，可能已过时` });
  }

  // ── Commute summary ──────────────────────────────────────
  const commute = community.commute;
  const commuteSummary = {
    roadDistanceKm: commute?.roadDistanceKm ?? null,
    walkMinutes: commute?.walkMinutes ?? null,
    bikeMinutes: commute?.bikeMinutes ?? null,
    distance: community.distance,
    bikeTime: community.bikeTime,
  };

  return {
    name: community.name,
    commuteSummary,
    priceBadges,
    hasSharedData,
    priceRows,
    noPriceRows,
    layoutTags,
    factChips,
    pros,
    cons: community.warnings ?? [],
    notes,
    dataWarnings,
    contributor: community.contributor || '匿名',
    updatedAt: community.updatedAt || '未知',
  };
}
