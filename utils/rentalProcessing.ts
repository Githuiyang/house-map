import crypto from 'node:crypto';
import type {
  RentalIngestInput,
  RentalListingRecord,
  RentalParsedFields,
  RentalValidationResult,
  RentalVectorDocument,
} from '@/types/rental';
import { uniqueStrings } from '@/utils/collections';
import { toStableSlug } from '@/utils/slug';

const LAYOUT_DIGITS = ['零', '一', '二', '两', '三', '四', '五', '六'];
const KNOWN_DECORATIONS = ['精装修', '婚房装修', '豪华装修', '中等装修', '简装', '毛坯'];
const KNOWN_AMENITIES = ['电梯', '地下车位', '车位', '阳台', '地暖', '中央空调', '有钥匙', '拎包入住'];
const KNOWN_TAGS = ['双南', '南北通透', '近地铁', '近公司', '可谈', '挂牌', '婚房装修', '精装修', '有钥匙', '随时看房'];

function extractCommunityName(rawText: string): string {
  const compact = rawText.replace(/[，。,；;！!？?\s]+/g, ' ').trim();
  const stopPatterns = [
    /(一|二|两|三|四|五|六)(室|房)/,
    /\d{3,5}(?:元|块|\/月|一个月|每月)/,
    /出租/,
    /挂牌/,
    /精装修|婚房装修|豪华装修|简装|毛坯/,
    /双南|南北通透|朝南|南向/,
    /电梯/,
  ];
  const endIndex = stopPatterns.reduce((min, pattern) => {
    const index = compact.search(pattern);
    if (index === -1) return min;
    return Math.min(min, index);
  }, compact.length);
  const candidate = compact.slice(0, endIndex).replace(/[，。,；;\s]+$/g, '').trim();
  return candidate || rawText.split(/[，。,；;\n]/)[0]?.trim() || '未知小区';
}

function extractPrice(rawText: string): number | null {
  const matches = Array.from(rawText.matchAll(/(\d{3,5})(?:\s*)(?:元|块|\/月|一个月|每月)/g));
  if (matches.length > 0) return Number(matches[0][1]);
  const fallback = rawText.match(/挂牌\s*(\d{3,5})/);
  if (fallback?.[1]) return Number(fallback[1]);
  const plain = rawText.match(/(\d{3,5})(?=\s*(?:可谈|面议|左右|整租|合租|[，。,；;]|$))/);
  if (plain?.[1]) return Number(plain[1]);
  return null;
}

function extractArea(rawText: string): number | null {
  const area = rawText.match(/(\d{1,3}(?:\.\d{1,2})?)\s*(?:平|平米|㎡|m²)/i);
  return area?.[1] ? Number(area[1]) : null;
}

function textHasLayoutToken(text: string, token: string): boolean {
  return text.includes(token) || text.includes(token.replace('室', '房'));
}

function extractLayout(rawText: string): Pick<RentalParsedFields, 'layout' | 'rooms' | 'halls' | 'bathrooms'> {
  const normalized = rawText.replace(/\s+/g, '');
  const regex = /([一二两三四五六])(?:室|房)([零一二两三四五六]?)厅?([零一二两三四五六]?)卫?/;
  const matched = normalized.match(regex);
  if (matched) {
    const rooms = Math.max(1, LAYOUT_DIGITS.indexOf(matched[1]));
    const halls = matched[2] ? Math.max(0, LAYOUT_DIGITS.indexOf(matched[2])) : 0;
    const bathrooms = matched[3] ? Math.max(0, LAYOUT_DIGITS.indexOf(matched[3])) : 0;
    const parts = [`${matched[1]}室`];
    if (matched[2]) parts.push(`${matched[2]}厅`);
    if (matched[3]) parts.push(`${matched[3]}卫`);
    return { layout: parts.join(''), rooms, halls, bathrooms };
  }

  if (textHasLayoutToken(normalized, '一房')) return { layout: '一室', rooms: 1, halls: 0, bathrooms: 0 };
  if (textHasLayoutToken(normalized, '二房')) return { layout: '两室', rooms: 2, halls: 0, bathrooms: 0 };
  if (textHasLayoutToken(normalized, '三房')) return { layout: '三室', rooms: 3, halls: 0, bathrooms: 0 };
  return { layout: null, rooms: 0, halls: 0, bathrooms: 0 };
}

function extractOrientation(rawText: string): string[] {
  return uniqueStrings([
    rawText.includes('双南') ? '双南' : '',
    rawText.includes('南北通透') ? '南北通透' : '',
    rawText.includes('朝南') ? '朝南' : '',
    rawText.includes('南向') ? '南向' : '',
    rawText.includes('东南') ? '东南' : '',
  ]);
}

function extractDecoration(rawText: string): string | null {
  return KNOWN_DECORATIONS.find(value => rawText.includes(value)) || null;
}

function extractAvailableFrom(rawText: string): string | null {
  const matched = rawText.match(/(\d{1,2})月(\d{1,2})[号日]\s*(?:空|可住|入住)/);
  if (!matched) return null;
  const month = matched[1].padStart(2, '0');
  const day = matched[2].padStart(2, '0');
  return `${month}-${day}`;
}

function extractFloorInfo(rawText: string): string | null {
  const matched = rawText.match(/([低中高]区|低楼层|中楼层|高楼层|[低中高]层|顶楼|复式)/);
  return matched?.[1] || null;
}

function extractHints(rawText: string): Pick<RentalParsedFields, 'locationHints' | 'amenities' | 'tags' | 'negotiable' | 'hasKey' | 'parkingIncluded' | 'elevator'> {
  const amenities = uniqueStrings(KNOWN_AMENITIES.filter(value => rawText.includes(value)).map(value => value === '车位' ? '地下车位' : value));
  const tags = uniqueStrings(KNOWN_TAGS.filter(value => rawText.includes(value)));
  const locationHints = uniqueStrings([
    rawText.includes('国定路') ? '国定路' : '',
    rawText.includes('国年路') ? '国年路' : '',
    rawText.includes('三门路') ? '三门路' : '',
  ]);
  const negotiable = /可谈|面议/.test(rawText);
  const hasKey = rawText.includes('有钥匙');
  const parkingIncluded = /车位/.test(rawText);
  const elevator = rawText.includes('电梯') ? true : null;
  return { locationHints, amenities, tags, negotiable, hasKey, parkingIncluded, elevator };
}

export function parseRentalInput(input: RentalIngestInput): RentalParsedFields {
  const communityName = extractCommunityName(input.rawText);
  const layoutInfo = extractLayout(input.rawText);
  const hints = extractHints(input.rawText);
  return {
    communityName,
    communityId: toStableSlug(communityName),
    price: extractPrice(input.rawText),
    areaSqm: extractArea(input.rawText),
    layout: layoutInfo.layout,
    rooms: layoutInfo.rooms,
    halls: layoutInfo.halls,
    bathrooms: layoutInfo.bathrooms,
    orientation: extractOrientation(input.rawText),
    decoration: extractDecoration(input.rawText),
    floorInfo: extractFloorInfo(input.rawText),
    locationHints: hints.locationHints,
    amenities: hints.amenities,
    tags: hints.tags,
    availableFrom: extractAvailableFrom(input.rawText),
    negotiable: hints.negotiable,
    hasKey: hints.hasKey,
    parkingIncluded: hints.parkingIncluded,
    elevator: hints.elevator,
  };
}

export function validateRentalParsed(parsed: RentalParsedFields): RentalValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const filled = [
    parsed.communityName,
    parsed.price,
    parsed.layout,
    parsed.areaSqm,
    parsed.orientation.length ? parsed.orientation.join(',') : '',
    parsed.availableFrom,
  ].filter(value => value !== null && value !== '').length;

  if (!parsed.communityName || parsed.communityName === '未知小区') errors.push('缺少可识别的小区名称');
  if (parsed.price === null) errors.push('缺少租金信息');
  if (parsed.price !== null && (parsed.price < 500 || parsed.price > 50000)) errors.push('租金超出合理区间');
  if (parsed.areaSqm !== null && (parsed.areaSqm < 5 || parsed.areaSqm > 500)) errors.push('面积超出合理区间');
  if (!parsed.layout) warnings.push('未识别到明确户型');
  if (!parsed.orientation.length) warnings.push('未识别朝向');
  if (!parsed.decoration) warnings.push('未识别装修标准');
  if (!parsed.availableFrom) warnings.push('未识别可入住时间');

  return {
    isValid: errors.length === 0,
    completeness: Number((filled / 6).toFixed(2)),
    errors,
    warnings,
  };
}

export function buildRentalVector(parsed: RentalParsedFields, rawText: string): RentalVectorDocument {
  const pricePerSqm = parsed.price && parsed.areaSqm ? Number((parsed.price / parsed.areaSqm).toFixed(2)) : 0;
  const keywords = uniqueStrings([
    parsed.communityName,
    parsed.layout || '',
    ...parsed.orientation,
    ...(parsed.amenities || []),
    ...(parsed.tags || []),
    ...(parsed.locationHints || []),
    parsed.decoration || '',
  ]);

  const sparse: Record<string, number> = {};
  keywords.forEach(keyword => {
    sparse[`kw:${keyword}`] = 1;
  });
  if (parsed.negotiable) sparse['flag:negotiable'] = 1;
  if (parsed.hasKey) sparse['flag:hasKey'] = 1;
  if (parsed.parkingIncluded) sparse['flag:parking'] = 1;
  if (parsed.elevator === true) sparse['flag:elevator'] = 1;
  if (parsed.layout) sparse[`layout:${parsed.layout}`] = 1;

  return {
    dense: [
      parsed.price ?? 0,
      parsed.areaSqm ?? 0,
      pricePerSqm,
      parsed.rooms,
      parsed.halls,
      parsed.bathrooms,
      parsed.orientation.length,
      parsed.negotiable ? 1 : 0,
      parsed.hasKey ? 1 : 0,
      parsed.parkingIncluded ? 1 : 0,
      parsed.elevator === true ? 1 : 0,
    ],
    sparse,
    keywords,
    searchableText: uniqueStrings([rawText, ...keywords]).join(' | '),
  };
}

export function buildDedupeKey(parsed: RentalParsedFields): string {
  const basis = [
    parsed.communityId,
    parsed.price ?? 'na',
    parsed.areaSqm ?? 'na',
    parsed.layout ?? 'na',
    parsed.orientation.join('-') || 'na',
    parsed.availableFrom ?? 'na',
  ].join('|');
  return crypto.createHash('sha1').update(basis).digest('hex');
}

export function createRentalRecord(input: RentalIngestInput): RentalListingRecord {
  const parsed = parseRentalInput(input);
  const validation = validateRentalParsed(parsed);
  const vector = buildRentalVector(parsed, input.rawText);
  const dedupeKey = buildDedupeKey(parsed);
  const now = input.capturedAt || new Date().toISOString();
  return {
    id: crypto.createHash('sha1').update(`${dedupeKey}|${input.rawText}`).digest('hex').slice(0, 16),
    dedupeKey,
    source: input.source || 'openclaw',
    externalId: input.externalId,
    rawText: input.rawText,
    parsed,
    vector,
    validation,
    reporter: input.reporter,
    capturedAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    seenCount: 1,
    version: 1,
    status: validation.isValid ? 'active' : 'inactive',
  };
}

export function summarizeQuality(records: RentalListingRecord[]): {
  missingFields: number;
  duplicateCandidates: number;
  invalidRecords: number;
} {
  const dedupeMap = new Map<string, number>();
  for (const record of records) {
    dedupeMap.set(record.dedupeKey, (dedupeMap.get(record.dedupeKey) || 0) + 1);
  }

  return {
    missingFields: records.filter(record => record.validation.warnings.length > 0).length,
    duplicateCandidates: Array.from(dedupeMap.values()).filter(count => count > 1).length,
    invalidRecords: records.filter(record => !record.validation.isValid).length,
  };
}
