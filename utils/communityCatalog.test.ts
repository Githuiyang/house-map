import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { syncCommunitiesFromRentals } from './communityCatalog';
import { createRentalRecord } from './rentalProcessing';

async function createCatalogFixture(initial: unknown) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'office-map-community-'));
  const dataPath = path.join(dir, 'communities.json');
  const backupPath = path.join(dir, 'communities.json.bak');
  await writeFile(dataPath, `${JSON.stringify(initial, null, 2)}\n`, 'utf8');
  await writeFile(backupPath, '[]\n', 'utf8');
  return { dataPath, backupPath };
}

describe('syncCommunitiesFromRentals', () => {
  it('creates missing community by geocoding and updates existing community', async () => {
    const fixture = await createCatalogFixture([
      {
        id: '国年路25弄',
        name: '国年路25弄',
        coordinates: [121.51, 31.30],
        distance: '0.5km',
        bikeTime: '步行6分钟',
        price: { min: 5000, max: 5000, unit: '月' },
        layouts: ['两室'],
        floorTypes: [],
        elevator: false,
        highlights: [],
        warnings: [],
        contributor: 'seed',
        updatedAt: '2026-03-01',
      },
    ]);

    const result = await syncCommunitiesFromRentals([
      createRentalRecord({ rawText: '国年路25弄，双南两房，5300可谈。', source: 'openclaw' }),
      createRentalRecord({ rawText: '美岸栖庭二房出租7300一个月。', source: 'openclaw' }),
    ], {
      ...fixture,
      geocodeFn: async (name) => (name === '美岸栖庭' ? [121.52, 31.31] : null),
    });

    const content = JSON.parse(await readFile(fixture.dataPath, 'utf8')) as Array<{ name: string; coordinates: [number, number]; price: { max: number } }>;

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.geocoded).toBe(1);
    expect(content).toHaveLength(2);
    expect(content.find(item => item.name === '美岸栖庭')?.coordinates).toEqual([121.52, 31.31]);
    expect(content.find(item => item.name === '国年路25弄')?.price.max).toBe(5300);
  });

  it('skips write when new community cannot be geocoded', async () => {
    const fixture = await createCatalogFixture([]);

    const result = await syncCommunitiesFromRentals([
      createRentalRecord({ rawText: '未知园区三房整租9000', source: 'openclaw' }),
    ], {
      ...fixture,
      geocodeFn: async () => null,
    });

    const content = JSON.parse(await readFile(fixture.dataPath, 'utf8')) as unknown[];

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(content).toHaveLength(0);
  });
});
