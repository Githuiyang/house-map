/**
 * 全面数据清理脚本
 * 1. 清除估算 pricePerRoom（多室户 shared=0 whole=0 的条目）
 * 2. 重算 pricePerRoomStats
 * 3. 清除残留 highlights
 */
const fs = require("fs");
const data = JSON.parse(fs.readFileSync("data/communities.json", "utf8"));

const isOneRoom = (layout) => layout && layout.includes("一室");

const changed = [];

// Step 1: 清理多室户估算 pricePerRoom
data.forEach(c => {
  if (!c.roomPricing || c.roomPricing.length === 0) return;
  c.roomPricing.forEach(rp => {
    if (rp.shared === 0 && rp.whole === 0 && rp.pricePerRoom && rp.pricePerRoom > 0) {
      if (isOneRoom(rp.layout)) return; // 一室户的 pricePerRoom 是整租参考价，保留
      // 多室户的 pricePerRoom 是估算值
      const old = rp.pricePerRoom;
      delete rp.pricePerRoom;
      changed.push(`[${c.name}] ${rp.layout}: 清除估算 pricePerRoom=${old}`);
    }
  });
});

// Step 2: 重算 pricePerRoomStats
// 内联计算逻辑（避免 import alias 问题）
function calcStats(roomPricing) {
  if (!roomPricing || roomPricing.length === 0) return undefined;
  const multiRoom = roomPricing.filter(rp => !rp.layout || !rp.layout.includes("一室"));
  if (multiRoom.length === 0) return undefined;
  const prices = multiRoom.map(rp => rp.pricePerRoom).filter(p => p != null && p > 0);
  if (prices.length === 0) return undefined;
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
  };
}

data.forEach(c => {
  const oldStats = c.pricePerRoomStats;
  const newStats = calcStats(c.roomPricing);
  const oldStr = oldStats ? JSON.stringify(oldStats) : "undefined";
  const newStr = newStats ? JSON.stringify(newStats) : "undefined";
  if (oldStr !== newStr) {
    changed.push(`[${c.name}] pricePerRoomStats: ${oldStr} -> ${newStr}`);
    if (newStats) {
      c.pricePerRoomStats = newStats;
    } else {
      delete c.pricePerRoomStats;
    }
  }
});

// Step 3: 清除残留 highlights（价格信息）
data.forEach(c => {
  if (!c.highlights) return;
  const before = c.highlights.length;
  c.highlights = c.highlights.filter(h => {
    if (h.includes("元/月") || h.includes("元约")) {
      changed.push(`[${c.name}] highlight "${h}" -> 删除`);
      return false;
    }
    return true;
  });
  if (c.highlights.length === 0) delete c.highlights;
});

// Write back
fs.writeFileSync("data/communities.json", JSON.stringify(data, null, 2) + "\n");
console.log(`\n共修复 ${changed.length} 项:\n`);
changed.forEach(c => console.log(`  ${c}`));
