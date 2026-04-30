/**
 * 一次性脚本：重算所有社区的 pricePerRoomStats（排除一室户）
 * 运行: npx tsx scripts/recalc-price-per-room.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 内联计算逻辑，避免 tsconfig alias 问题
interface RoomPricing {
  layout: string;
  rooms?: number;
  pricePerRoom?: number;
  shared: number;
  whole: number;
}

interface PricePerRoomStats {
  min: number;
  max: number;
  avg: number;
}

function calcPricePerRoomStats(
  roomPricing?: RoomPricing[]
): PricePerRoomStats | undefined {
  if (!roomPricing || roomPricing.length === 0) return undefined;
  const multiRoom = roomPricing.filter(rp => !rp.layout?.includes('一室'));
  if (multiRoom.length === 0) return undefined;
  const prices = multiRoom
    .map(rp => rp.pricePerRoom)
    .filter((p): p is number => p != null && p > 0);
  if (prices.length === 0) return undefined;
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(__dirname, '../../data/communities.json');

const raw = readFileSync(dataPath, 'utf-8');
const communities = JSON.parse(raw);

let changed = 0;
let cleared = 0;
let unchanged = 0;

for (const c of communities) {
  const oldStats = c.pricePerRoomStats;
  const newStats = calcPricePerRoomStats(c.roomPricing);

  if (JSON.stringify(oldStats) === JSON.stringify(newStats)) {
    unchanged++;
    continue;
  }

  if (newStats === undefined && oldStats !== undefined) {
    cleared++;
    console.log(`  ❌ ${c.name}: pricePerRoomStats removed (no multi-room data)`);
  } else {
    changed++;
    const oldAvg = oldStats?.avg ?? 'N/A';
    console.log(`  ✏️  ${c.name}: avg ${oldAvg} → ${newStats!.avg}`);
  }

  if (newStats === undefined) {
    delete c.pricePerRoomStats;
  } else {
    c.pricePerRoomStats = newStats;
  }
}

writeFileSync(dataPath, JSON.stringify(communities, null, 2) + '\n', 'utf-8');

console.log(`\nDone. ${changed} updated, ${cleared} cleared, ${unchanged} unchanged.`);
