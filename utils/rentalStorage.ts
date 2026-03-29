import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  RentalCommunitySnapshot,
  RentalFeedbackEntry,
  RentalHistoryEvent,
  RentalIngestInput,
  RentalIngestResult,
  RentalListingRecord,
  RentalSystemSnapshot,
  RentalTrendReport,
} from '@/types/rental';
import { averageNumbers, uniqueStrings } from '@/utils/collections';
import { createRentalRecord } from '@/utils/rentalProcessing';
import { generateTrendReport } from '@/utils/rentalAnalysis';

export interface RentalStorageOptions {
  baseDir?: string;
}

interface StoragePaths {
  root: string;
  currentSnapshot: string;
  historyEvents: string;
  feedback: string;
  backups: string;
  reports: string;
}

const DEFAULT_BASE_DIR = path.join(process.cwd(), 'data', 'rental-system');

function getPaths(options?: RentalStorageOptions): StoragePaths {
  const root = options?.baseDir || DEFAULT_BASE_DIR;
  return {
    root,
    currentSnapshot: path.join(root, 'current-snapshot.json'),
    historyEvents: path.join(root, 'history-events.json'),
    feedback: path.join(root, 'feedback.json'),
    backups: path.join(root, 'backups'),
    reports: path.join(root, 'reports'),
  };
}

async function ensureStorage(options?: RentalStorageOptions): Promise<StoragePaths> {
  const paths = getPaths(options);
  await mkdir(paths.root, { recursive: true });
  await mkdir(paths.backups, { recursive: true });
  await mkdir(paths.reports, { recursive: true });
  return paths;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function buildCommunitySnapshots(listings: RentalListingRecord[]): RentalCommunitySnapshot[] {
  const map = new Map<string, RentalListingRecord[]>();
  for (const listing of listings.filter(item => item.status === 'active')) {
    const bucket = map.get(listing.parsed.communityId) || [];
    bucket.push(listing);
    map.set(listing.parsed.communityId, bucket);
  }

  return Array.from(map.entries()).map(([communityId, items]) => {
    const prices = items.map(item => item.parsed.price).filter((value): value is number => value !== null);
    const areas = items.map(item => item.parsed.areaSqm).filter((value): value is number => value !== null);
    const layoutMix = items.reduce<Record<string, number>>((acc, item) => {
      const layout = item.parsed.layout || '未知';
      acc[layout] = (acc[layout] || 0) + 1;
      return acc;
    }, {});

    return {
      communityId,
      communityName: items[0]?.parsed.communityName || communityId,
      listingIds: items.map(item => item.id),
      activeListingCount: items.length,
      latestCapturedAt: items.map(item => item.capturedAt).sort().at(-1) || new Date().toISOString(),
      avgPrice: averageNumbers(prices),
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      avgAreaSqm: averageNumbers(areas),
      layoutMix,
      tags: uniqueStrings(items.flatMap(item => item.parsed.tags)),
      amenities: uniqueStrings(items.flatMap(item => item.parsed.amenities)),
    };
  }).sort((a, b) => a.communityName.localeCompare(b.communityName, 'zh-CN'));
}

export async function loadCurrentSnapshot(options?: RentalStorageOptions): Promise<RentalSystemSnapshot> {
  const paths = await ensureStorage(options);
  return readJsonFile<RentalSystemSnapshot>(paths.currentSnapshot, {
    updatedAt: new Date(0).toISOString(),
    totalListings: 0,
    activeListings: 0,
    listings: [],
    communities: [],
  });
}

export async function loadHistoryEvents(options?: RentalStorageOptions): Promise<RentalHistoryEvent[]> {
  const paths = await ensureStorage(options);
  return readJsonFile<RentalHistoryEvent[]>(paths.historyEvents, []);
}

export async function loadFeedbackEntries(options?: RentalStorageOptions): Promise<RentalFeedbackEntry[]> {
  const paths = await ensureStorage(options);
  return readJsonFile<RentalFeedbackEntry[]>(paths.feedback, []);
}

async function backupSnapshot(snapshot: RentalSystemSnapshot, options?: RentalStorageOptions) {
  const paths = await ensureStorage(options);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(paths.backups, `${stamp}.json`);
  await writeJsonFile(target, snapshot);
  return target;
}

async function saveSnapshot(snapshot: RentalSystemSnapshot, events: RentalHistoryEvent[], options?: RentalStorageOptions) {
  const paths = await ensureStorage(options);
  await writeJsonFile(paths.currentSnapshot, snapshot);
  await writeJsonFile(paths.historyEvents, events);
}

function mergeRecord(existing: RentalListingRecord, next: RentalListingRecord): RentalListingRecord {
  return {
    ...existing,
    rawText: next.rawText,
    parsed: {
      ...existing.parsed,
      ...next.parsed,
      amenities: Array.from(new Set([...existing.parsed.amenities, ...next.parsed.amenities])),
      tags: Array.from(new Set([...existing.parsed.tags, ...next.parsed.tags])),
      locationHints: Array.from(new Set([...existing.parsed.locationHints, ...next.parsed.locationHints])),
      orientation: Array.from(new Set([...existing.parsed.orientation, ...next.parsed.orientation])),
    },
    vector: next.vector,
    validation: next.validation,
    reporter: next.reporter || existing.reporter,
    capturedAt: next.capturedAt,
    lastSeenAt: next.capturedAt,
    seenCount: existing.seenCount + 1,
    version: existing.version + 1,
    status: next.validation.isValid ? 'active' : existing.status,
  };
}

function createEvent(type: RentalHistoryEvent['type'], detail: Record<string, unknown>): RentalHistoryEvent {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.createHash('sha1').update(`${type}|${timestamp}|${JSON.stringify(detail)}`).digest('hex').slice(0, 16),
    type,
    timestamp,
    listingId: typeof detail.listingId === 'string' ? detail.listingId : undefined,
    dedupeKey: typeof detail.dedupeKey === 'string' ? detail.dedupeKey : undefined,
    communityId: typeof detail.communityId === 'string' ? detail.communityId : undefined,
    detail,
  };
}

export async function ingestRentalBatch(inputs: RentalIngestInput[], options?: RentalStorageOptions): Promise<RentalIngestResult> {
  const current = await loadCurrentSnapshot(options);
  const historyEvents = await loadHistoryEvents(options);
  await backupSnapshot(current, options);

  const listings = [...current.listings];
  let inserted = 0;
  let merged = 0;
  let invalid = 0;
  const processedItems: RentalListingRecord[] = [];

  for (const input of inputs) {
    const next = createRentalRecord(input);
    processedItems.push(next);
    if (!next.validation.isValid) invalid += 1;

    const index = listings.findIndex(item => item.dedupeKey === next.dedupeKey);
    if (index >= 0) {
      const combined = mergeRecord(listings[index], next);
      listings[index] = combined;
      merged += 1;
      historyEvents.push(createEvent('merge', {
        listingId: combined.id,
        dedupeKey: combined.dedupeKey,
        communityId: combined.parsed.communityId,
        version: combined.version,
      }));
      continue;
    }

    listings.push(next);
    inserted += 1;
    historyEvents.push(createEvent('ingest', {
      listingId: next.id,
      dedupeKey: next.dedupeKey,
      communityId: next.parsed.communityId,
      source: next.source,
    }));
  }

  const activeListings = listings.filter(item => item.status === 'active').length;
  const snapshot: RentalSystemSnapshot = {
    updatedAt: new Date().toISOString(),
    totalListings: listings.length,
    activeListings,
    listings,
    communities: buildCommunitySnapshots(listings),
  };
  await saveSnapshot(snapshot, historyEvents, options);

  const report = await generateAndPersistTrendReport(snapshot, historyEvents, options);
  return {
    snapshot,
    report,
    processed: inputs.length,
    inserted,
    merged,
    invalid,
    items: processedItems,
  };
}

export async function generateAndPersistTrendReport(
  snapshot?: RentalSystemSnapshot,
  events?: RentalHistoryEvent[],
  options?: RentalStorageOptions
): Promise<RentalTrendReport> {
  const paths = await ensureStorage(options);
  const currentSnapshot = snapshot || await loadCurrentSnapshot(options);
  const history = events || await loadHistoryEvents(options);
  const report = generateTrendReport(currentSnapshot, history);
  const target = path.join(paths.reports, 'latest-report.json');
  await writeJsonFile(target, report);
  return report;
}

export async function loadLatestTrendReport(options?: RentalStorageOptions): Promise<RentalTrendReport> {
  const paths = await ensureStorage(options);
  const fallback = generateTrendReport(await loadCurrentSnapshot(options), await loadHistoryEvents(options));
  return readJsonFile<RentalTrendReport>(path.join(paths.reports, 'latest-report.json'), fallback);
}

export async function restoreLatestBackup(options?: RentalStorageOptions): Promise<RentalSystemSnapshot | null> {
  const paths = await ensureStorage(options);
  const files = (await readdir(paths.backups)).filter(file => file.endsWith('.json')).sort();
  const latest = files.at(-1);
  if (!latest) return null;
  const snapshot = await readJsonFile<RentalSystemSnapshot>(path.join(paths.backups, latest), await loadCurrentSnapshot(options));
  const events = await loadHistoryEvents(options);
  events.push(createEvent('restore', { backup: latest }));
  await saveSnapshot(snapshot, events, options);
  await generateAndPersistTrendReport(snapshot, events, options);
  return snapshot;
}

export async function submitRentalFeedback(
  input: Omit<RentalFeedbackEntry, 'id' | 'createdAt'>,
  options?: RentalStorageOptions
): Promise<RentalFeedbackEntry> {
  const paths = await ensureStorage(options);
  const feedback = await loadFeedbackEntries(options);
  const entry: RentalFeedbackEntry = {
    id: crypto.createHash('sha1').update(`${Date.now()}|${input.message}|${input.contact || ''}`).digest('hex').slice(0, 16),
    createdAt: new Date().toISOString(),
    ...input,
  };
  feedback.push(entry);
  await writeJsonFile(paths.feedback, feedback);
  return entry;
}
