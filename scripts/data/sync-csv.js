/**
 * CSV → JSON 同步脚本
 * 数据流: 房源数据存档.csv → communities.json
 *
 * 用法: node scripts/data/sync-csv.js [--dry-run]
 *
 * 规则:
 *   1. CSV 是唯一数据源 (Single Source of Truth)
 *   2. 只追加/更新，不删除历史记录
 *   3. 亮点中移除价格信息
 *   4. 自动计算 pricePerRoomStats
 *   5. --dry-run 只输出差异，不写文件
 */
const fs = require("fs");
const path = require("path");

const CSV_PATH = path.join(__dirname, "../../data/房源数据存档.csv");
const JSON_PATH = path.join(__dirname, "../../data/communities.json");

const isDryRun = process.argv.includes("--dry-run");

// ─── CSV 解析 ───────────────────────────────────────────
function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter(l => l.trim());
  const headers = lines[0].split(",").map(h => h.trim());

  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  });
}

// ─── 亮点清洗 ───────────────────────────────────────────
function cleanHighlights(tags) {
  if (!tags) return [];
  return tags
    .split(/[，,]/)
    .map(t => t.trim())
    .filter(t => {
      if (!t) return false;
      // 移除包含价格信息的条目
      if (/\d{3,}元/.test(t)) return false;
      if (/^\d{2,}好谈$/.test(t)) return false;
      if (/^\d+平/.test(t) && /\d{3,}/.test(t)) return false;
      // 移除租房流程描述
      if (/首次出租|可谈约看房|租客转租|价格小谈/.test(t)) return false;
      return true;
    });
}

// ─── 备注转 warnings ───────────────────────────────────
function extractWarnings(note) {
  if (!note) return [];
  return note.split(/[，,]/).map(w => w.trim()).filter(Boolean);
}

// ─── 户型 → 房间数 ──────────────────────────────────────
function getRoomCount(layout) {
  if (!layout) return 0;
  const match = layout.match(/(一|两|二|三|四|五|六)\s*室/);
  if (!match) return 1;
  const map = { "一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6 };
  return map[match[1]] || 1;
}

// ─── 判断是否一室户 ──────────────────────────────────────
function isOneRoom(layout) {
  return layout && layout.includes("一室");
}

// ─── 聚合 CSV 行为小区 ──────────────────────────────────
function aggregateByCommunity(rows) {
  const map = new Map();

  for (const row of rows) {
    const name = row["小区名称"];
    if (!name) continue;

    if (!map.has(name)) {
      map.set(name, {
        name,
        layouts: [],
        floorTypes: new Set(),
        elevator: row["电梯"] === "有电梯",
        highlights: [],
        warnings: [],
        contributor: row["信息来源"] || "即刻社区",
        updatedAt: row["录入时间"] || "未知",
        roomPricing: [],
        priceEntries: [],
      });
    }

    const c = map.get(name);

    // 楼层类型
    const floor = row["楼层"];
    if (floor) {
      floor.split("/").forEach(f => { if (f.trim()) c.floorTypes.add(f.trim()); });
    }

    // 户型 + 价格
    const layout = row["户型"];
    if (layout && !c.layouts.includes(layout)) {
      c.layouts.push(layout);
    }

    // 价格
    const price = parseInt(row["租金价格(元/月)"]) || 0;
    const rentType = row["租金类型"];
    const priceType = row["价格类型"];
    const area = row["面积(平)"];

    c.priceEntries.push({ layout, price, rentType, priceType, area });

    // 亮点 + 注意事项
    const tags = cleanHighlights(row["特色标签"]);
    tags.forEach(t => { if (!c.highlights.includes(t)) c.highlights.push(t); });

    const warns = extractWarnings(row["备注"]);
    warns.forEach(w => { if (!c.warnings.includes(w)) c.warnings.push(w); });
  }

  return map;
}

// ─── 从价格条目构建 roomPricing + price ──────────────────
function buildPricing(community) {
  const { priceEntries } = community;
  const roomPricing = [];
  const seenKeys = new Set();
  let minPrice = Infinity, maxPrice = 0;

  for (const entry of priceEntries) {
    if (!entry.layout) continue;

    const rooms = getRoomCount(entry.layout);
    const area = entry.area
      ? (entry.area.includes("平") ? entry.area : entry.area + "平")
      : undefined;

    // 去重 key: layout + area（同户型不同面积视为不同条目）
    const key = `${entry.layout}||${area || ""}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    let whole = 0, shared = 0, pricePerRoom = 0;

    if (entry.price > 0) {
      if (entry.rentType === "整租" || entry.priceType === "总价") {
        whole = entry.price;
      } else if (entry.rentType === "合租") {
        shared = entry.price;
      } else if (isOneRoom(entry.layout)) {
        pricePerRoom = entry.price;
      }
    }

    const rp = { layout: entry.layout, shared, whole, rooms };
    if (area) rp.area = area;
    if (pricePerRoom > 0) rp.pricePerRoom = pricePerRoom;
    if (whole > 0 && rooms > 1) rp.pricePerRoom = Math.round(whole / rooms);

    roomPricing.push(rp);

    if (whole > 0) {
      minPrice = Math.min(minPrice, whole);
      maxPrice = Math.max(maxPrice, whole);
    }
    if (pricePerRoom > 0 && isOneRoom(entry.layout)) {
      minPrice = Math.min(minPrice, pricePerRoom);
      maxPrice = Math.max(maxPrice, pricePerRoom);
    }
  }

  return {
    roomPricing,
    price: {
      min: minPrice === Infinity ? 0 : minPrice,
      max: maxPrice,
      unit: "月",
    },
  };
}

// ─── 计算 pricePerRoomStats（排除一室户）─────────────────
function calcStats(roomPricing) {
  const multiRoom = (roomPricing || []).filter(rp => !isOneRoom(rp.layout));
  const prices = multiRoom
    .map(rp => rp.pricePerRoom)
    .filter(p => p != null && p > 0);
  if (prices.length === 0) return undefined;
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
  };
}

// ─── 主流程 ─────────────────────────────────────────────
function main() {
  console.log("=== CSV → JSON 同步 ===\n");
  if (isDryRun) console.log("[DRY RUN] 只输出差异，不写入文件\n");

  // 1. 读取数据
  const csvRows = parseCSV(CSV_PATH);
  const communities = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const csvCommunities = aggregateByCommunity(csvRows);

  console.log(`CSV: ${csvRows.length} 行，${csvCommunities.size} 个小区`);
  console.log(`JSON: ${communities.length} 个小区\n`);

  const changes = [];
  let newCount = 0;
  let updateCount = 0;

  // 2. 逐小区对比
  for (const [name, csvData] of csvCommunities) {
    const existing = communities.find(c => c.name === name);
    const { roomPricing, price } = buildPricing(csvData);
    const stats = calcStats(roomPricing);

    if (!existing) {
      // 新小区
      changes.push(`[新增] ${name}`);
      newCount++;

      if (!isDryRun) {
        communities.push({
          id: name.toLowerCase().replace(/[\s·]/g, "-").replace(/[^\w-]/g, "") || `new-${Date.now()}`,
          name,
          coordinates: [0, 0], // 需要后续补充坐标
          distance: "未知",
          bikeTime: "未知",
          price,
          floorTypes: [...csvData.floorTypes],
          layouts: csvData.layouts.filter(Boolean),
          elevator: csvData.elevator,
          highlights: csvData.highlights.length > 0 ? csvData.highlights : undefined,
          warnings: csvData.warnings.length > 0 ? csvData.warnings : [],
          contributor: csvData.contributor,
          updatedAt: csvData.updatedAt,
          roomPricing,
          pricePerRoomStats: stats,
        });
      }
      continue;
    }

    // 已有小区 → 对比差异
    const diffs = [];

    // 对比价格
    const oldPrice = `${existing.price.min}-${existing.price.max}`;
    const newPrice = `${price.min}-${price.max}`;
    if (oldPrice !== newPrice && (price.min > 0 || price.max > 0)) {
      diffs.push(`价格: ${oldPrice} → ${newPrice}`);
      if (!isDryRun) {
        existing.price = price;
      }
    }

    // 对比 roomPricing
    const oldRP = JSON.stringify(existing.roomPricing || []);
    const newRP = JSON.stringify(roomPricing);
    if (oldRP !== newRP) {
      // 详细列出变化
      const oldLayouts = (existing.roomPricing || []).map(r => `${r.layout}: whole=${r.whole} shared=${r.shared} ppr=${r.pricePerRoom || 0}`);
      const newLayouts = roomPricing.map(r => `${r.layout}: whole=${r.whole} shared=${r.shared} ppr=${r.pricePerRoom || 0}`);

      for (const nr of roomPricing) {
        const or = (existing.roomPricing || []).find(r => r.layout === nr.layout);
        if (!or) {
          diffs.push(`新增户型: ${nr.layout} (whole=${nr.whole}, ppr=${nr.pricePerRoom || 0})`);
        } else {
          const parts = [];
          if (or.whole !== nr.whole && nr.whole > 0) parts.push(`whole: ${or.whole}→${nr.whole}`);
          if (or.shared !== nr.shared && nr.shared > 0) parts.push(`shared: ${or.shared}→${nr.shared}`);
          if ((or.pricePerRoom || 0) !== (nr.pricePerRoom || 0) && nr.pricePerRoom > 0) parts.push(`ppr: ${or.pricePerRoom || 0}→${nr.pricePerRoom}`);
          if (parts.length > 0) diffs.push(`${nr.layout}: ${parts.join(", ")}`);
        }
      }

      if (!isDryRun) {
        existing.roomPricing = roomPricing;
      }
    }

    // 对比 highlights
    const newHL = csvData.highlights;
    const oldHL = existing.highlights || [];
    const addedHL = newHL.filter(h => !oldHL.includes(h));
    const removedHL = oldHL.filter(h => !newHL.includes(h));
    if (addedHL.length > 0) diffs.push(`亮点 +${addedHL.join(", ")}`);
    if (removedHL.length > 0) diffs.push(`亮点 -${removedHL.join(", ")}`);
    if (!isDryRun && (addedHL.length > 0 || removedHL.length > 0)) {
      existing.highlights = newHL.length > 0 ? newHL : undefined;
    }

    // 对比 warnings
    const newW = csvData.warnings;
    const oldW = existing.warnings || [];
    const addedW = newW.filter(w => !oldW.includes(w));
    const removedW = oldW.filter(w => !newW.includes(w));
    if (addedW.length > 0) diffs.push(`注意 +${addedW.join(", ")}`);
    if (removedW.length > 0) diffs.push(`注意 -${removedW.join(", ")}`);
    if (!isDryRun && (addedW.length > 0 || removedW.length > 0)) {
      existing.warnings = newW;
    }

    // 对比 layouts
    const newLayouts = csvData.layouts.filter(Boolean);
    const oldLayouts = existing.layouts || [];
    const addedLayouts = newLayouts.filter(l => !oldLayouts.includes(l));
    if (addedLayouts.length > 0) {
      diffs.push(`户型 +${addedLayouts.join(", ")}`);
      if (!isDryRun) existing.layouts = newLayouts;
    }

    // 对比 pricePerRoomStats
    const oldStats = existing.pricePerRoomStats;
    const newStatsStr = stats ? JSON.stringify(stats) : "undefined";
    const oldStatsStr = oldStats ? JSON.stringify(oldStats) : "undefined";
    if (newStatsStr !== oldStatsStr) {
      diffs.push(`pricePerRoomStats: ${oldStatsStr} → ${newStatsStr}`);
      if (!isDryRun) {
        if (stats) existing.pricePerRoomStats = stats;
        else delete existing.pricePerRoomStats;
      }
    }

    if (diffs.length > 0) {
      changes.push(`[更新] ${name}: ${diffs.join(" | ")}`);
      updateCount++;
    }
  }

  // 3. 检查 JSON 中有但 CSV 中没有的小区
  const csvNames = new Set(csvCommunities.keys());
  const jsonOnlyNames = communities.filter(c => !csvNames.has(c.name));
  if (jsonOnlyNames.length > 0) {
    changes.push(`\n[仅在JSON] ${jsonOnlyNames.length} 个小区不在CSV中: ${jsonOnlyNames.map(c => c.name).join(", ")}`);
  }

  // 4. 输出结果
  console.log("=== 差异报告 ===\n");
  if (changes.length === 0) {
    console.log("无差异，数据已是最新。");
  } else {
    changes.forEach(c => console.log(`  ${c}`));
    console.log(`\n共 ${newCount} 个新增，${updateCount} 个更新`);
  }

  // 5. 写入
  if (!isDryRun && (newCount > 0 || updateCount > 0)) {
    fs.writeFileSync(JSON_PATH, JSON.stringify(communities, null, 2) + "\n");
    console.log("\n已写入 communities.json");
  } else if (isDryRun) {
    console.log("\n[DRY RUN] 未写入文件");
  }
}

main();
