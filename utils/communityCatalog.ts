import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { calculateDistanceMeters } from '@/utils/geo';
import { COMPANY_COORDS } from '@/utils/constants';
import { createDefaultCommunity, type Community } from '@/types/community';
import type { RentalCommunitySyncItem, RentalCommunitySyncResult, RentalListingRecord } from '@/types/rental';
import { uniqueStrings } from '@/utils/collections';
import { toStableSlug } from '@/utils/slug';

export interface CommunityCatalogOptions {
  dataPath?: string;
  backupPath?: string;
  geocodeFn?: (communityName: string) => Promise<[number, number] | null>;
}

function defaultDataPath() {
  return path.join(process.cwd(), 'data', 'communities.json');
}

function defaultBackupPath() {
  return path.join(process.cwd(), 'data', 'communities.json.bak');
}

function formatDistance(distanceMeters: number): string {
  return `${(distanceMeters / 1000).toFixed(1)}km`;
}

function formatBikeTime(distanceMeters: number): string {
  if (distanceMeters <= 800) {
    return `步行${Math.max(3, Math.round(distanceMeters / 80))}分钟`;
  }
  return `骑车${Math.max(5, Math.round(distanceMeters / 250))}分钟`;
}

function deriveHighlights(listings: RentalListingRecord[], distanceMeters: number): string[] {
  const tags = listings.flatMap(item => item.parsed.tags);
  const amenities = listings.flatMap(item => item.parsed.amenities);
  const extra = distanceMeters <= 1000 ? ['离公司较近'] : [];
  return uniqueStrings([...tags, ...amenities, ...extra]).slice(0, 6);
}

function deriveWarnings(listings: RentalListingRecord[]): string[] {
  return uniqueStrings(listings.flatMap(item => item.validation.warnings)).slice(0, 4);
}

function buildCommunityRecord(
  communityName: string,
  coords: [number, number],
  listings: RentalListingRecord[],
  existing?: Community
): Community {
  const prices = listings.map(item => item.parsed.price).filter((value): value is number => value !== null);
  const distanceMeters = calculateDistanceMeters(coords, COMPANY_COORDS);
  const contributorSet = uniqueStrings([
    existing?.contributor || '',
    ...listings.map(item => item.reporter || ''),
    ...listings.map(item => item.source),
  ]);

  return createDefaultCommunity({
    ...existing,
    id: existing?.id || toStableSlug(communityName),
    name: communityName,
    coordinates: coords,
    distance: formatDistance(distanceMeters),
    bikeTime: formatBikeTime(distanceMeters),
    price: {
      min: prices.length ? Math.min(existing?.price.min ?? Infinity, ...prices) : existing?.price.min ?? 0,
      max: prices.length ? Math.max(existing?.price.max ?? 0, ...prices) : existing?.price.max ?? 0,
      unit: existing?.price.unit || '月',
    },
    layouts: uniqueStrings([...(existing?.layouts || []), ...listings.map(item => item.parsed.layout || '')]).slice(0, 8),
    floorTypes: uniqueStrings([...(existing?.floorTypes || []), ...listings.map(item => item.parsed.floorInfo || '')]).slice(0, 6),
    elevator: existing?.elevator ?? listings.some(item => item.parsed.elevator === true),
    highlights: deriveHighlights(listings, distanceMeters),
    warnings: uniqueStrings([...(existing?.warnings || []), ...deriveWarnings(listings)]).slice(0, 6),
    contributor: contributorSet.join(', '),
    updatedAt: new Date().toISOString().slice(0, 10),
  });
}

async function readCommunities(dataPath: string): Promise<Community[]> {
  const content = await readFile(dataPath, 'utf8');
  const parsed = JSON.parse(content) as Community[];
  return Array.isArray(parsed) ? parsed.map(item => createDefaultCommunity(item)) : [];
}

async function writeCommunities(dataPath: string, backupPath: string, communities: Community[]) {
  const existing = await readFile(dataPath, 'utf8');
  await writeFile(backupPath, existing, 'utf8');
  await writeFile(dataPath, `${JSON.stringify(communities, null, 2)}\n`, 'utf8');
}

function amapKey() {
  return process.env.AMAP_WEB_KEY || process.env.NEXT_PUBLIC_AMAP_KEY || '';
}

function parseLocation(location?: string): [number, number] | null {
  if (!location) return null;
  const coords = location.split(',').map(Number);
  if (coords.length !== 2 || !coords.every(Number.isFinite)) return null;
  return [coords[0], coords[1]];
}

async function fetchAmapLocation(url: string, field: 'geocodes' | 'pois'): Promise<[number, number] | null> {
  const response = await fetch(url);
  const data = await response.json() as {
    status?: string;
    geocodes?: Array<{ location?: string }>;
    pois?: Array<{ location?: string }>;
  };

  if (data.status !== '1') return null;
  const location = field === 'geocodes' ? data.geocodes?.[0]?.location : data.pois?.[0]?.location;
  return parseLocation(location);
}

async function geocodeByAmap(communityName: string): Promise<[number, number] | null> {
  const key = amapKey();
  if (!key) return null;

  const queries = [
    `上海市杨浦区${communityName}`,
    `上海杨浦${communityName}`,
    `${communityName}小区`,
    communityName,
  ];

  for (const query of queries) {
    const geoUrl = `https://restapi.amap.com/v3/geocode/geo?key=${key}&address=${encodeURIComponent(query)}`;
    const geoCoords = await fetchAmapLocation(geoUrl, 'geocodes');
    if (geoCoords) return geoCoords;

    const poiUrl = `https://restapi.amap.com/v3/place/text?key=${key}&keywords=${encodeURIComponent(query)}&city=上海&citylimit=true&offset=1`;
    const poiCoords = await fetchAmapLocation(poiUrl, 'pois');
    if (poiCoords) return poiCoords;
  }

  return null;
}

function groupValidListings(listings: RentalListingRecord[]): Map<string, RentalListingRecord[]> {
  const groupMap = new Map<string, RentalListingRecord[]>();
  for (const listing of listings) {
    if (!listing.validation.isValid) continue;
    const key = listing.parsed.communityId;
    const bucket = groupMap.get(key) || [];
    bucket.push(listing);
    groupMap.set(key, bucket);
  }
  return groupMap;
}

function createSyncItem(
  communityId: string,
  communityName: string,
  action: RentalCommunitySyncItem['action'],
  geocoded: boolean,
  message: string
): RentalCommunitySyncItem {
  return { communityId, communityName, action, geocoded, message };
}

export async function syncCommunitiesFromRentals(
  listings: RentalListingRecord[],
  options?: CommunityCatalogOptions
): Promise<RentalCommunitySyncResult> {
  const dataPath = options?.dataPath || defaultDataPath();
  const backupPath = options?.backupPath || defaultBackupPath();
  const geocodeFn = options?.geocodeFn || geocodeByAmap;
  const communities = await readCommunities(dataPath);
  const items: RentalCommunitySyncItem[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let geocoded = 0;
  let dirty = false;
  const groupMap = groupValidListings(listings);

  for (const [communityId, group] of groupMap.entries()) {
    const communityName = group[0]?.parsed.communityName || communityId;
    const index = communities.findIndex(item => item.id === communityId || item.name === communityName);
    if (index >= 0) {
      const merged = buildCommunityRecord(communityName, communities[index].coordinates, group, communities[index]);
      communities[index] = merged;
      updated += 1;
      dirty = true;
      items.push(createSyncItem(communityId, communityName, 'updated', false, '已合并到现有小区数据并保留原坐标'));
      continue;
    }

    const coords = await geocodeFn(communityName);
    if (!coords) {
      skipped += 1;
      items.push(createSyncItem(communityId, communityName, 'skipped', false, '未获取到地图坐标，未自动写入地图数据，请人工补充'));
      continue;
    }

    communities.push(buildCommunityRecord(communityName, coords, group));
    created += 1;
    geocoded += 1;
    dirty = true;
    items.push(createSyncItem(communityId, communityName, 'created', true, '已创建新小区并写入地图数据源'));
  }

  if (dirty) {
    communities.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    await writeCommunities(dataPath, backupPath, communities);
  }

  return {
    created,
    updated,
    skipped,
    geocoded,
    items,
  };
}
