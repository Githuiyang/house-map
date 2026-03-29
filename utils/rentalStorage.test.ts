import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  generateAndPersistTrendReport,
  ingestRentalBatch,
  loadCurrentSnapshot,
  loadLatestTrendReport,
  restoreLatestBackup,
  submitRentalFeedback,
} from './rentalStorage';

async function createTempStorage() {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), 'office-map-rentals-'));
  return { baseDir };
}

describe('rentalStorage', () => {
  it('ingests listings and merges duplicates incrementally', async () => {
    const storage = await createTempStorage();

    const first = await ingestRentalBatch([
      { rawText: '国年路25弄，双南两房，5300可谈。', source: 'openclaw', capturedAt: '2026-03-01T10:00:00.000Z' },
    ], storage);

    const second = await ingestRentalBatch([
      { rawText: '国年路25弄，双南两房，5300可谈。', source: 'openclaw', capturedAt: '2026-03-02T10:00:00.000Z' },
      { rawText: '美岸栖庭二房出租7300一个月。', source: 'openclaw', capturedAt: '2026-03-02T11:00:00.000Z' },
    ], storage);

    expect(first.inserted).toBe(1);
    expect(second.merged).toBe(1);
    expect(second.inserted).toBe(1);

    const snapshot = await loadCurrentSnapshot(storage);
    expect(snapshot.totalListings).toBe(2);
    expect(snapshot.communities).toHaveLength(2);
    expect(snapshot.listings.find(item => item.parsed.communityName === '国年路25弄')?.seenCount).toBe(2);
  });

  it('persists reports, backup restore and feedback entries', async () => {
    const storage = await createTempStorage();

    await ingestRentalBatch([
      { rawText: '国定路财大小区，二室一厅，双南，精装修，6500元约看房，4月20号空', source: 'openclaw', capturedAt: '2026-03-01T10:00:00.000Z' },
      { rawText: '美岸栖庭二房出租7300一个月。', source: 'openclaw', capturedAt: '2026-03-03T10:00:00.000Z' },
    ], storage);

    const report = await generateAndPersistTrendReport(undefined, undefined, storage);
    const latest = await loadLatestTrendReport(storage);
    const feedback = await submitRentalFeedback({ rating: 4, message: '国定路样本识别正确', communityId: '国定路财大小区' }, storage);
    const restored = await restoreLatestBackup(storage);

    expect(report.totals.activeListings).toBe(2);
    expect(latest.byCommunity).toHaveLength(2);
    expect(feedback.id).toHaveLength(16);
    expect(restored?.totalListings).toBeGreaterThanOrEqual(0);
  });
});
