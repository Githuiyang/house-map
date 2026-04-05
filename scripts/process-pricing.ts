/**
 * 租金数据处理脚本
 *
 * 读取 raw-pricing.json 原始数据，处理后更新 communities.json
 *
 * 规则：
 *   1. 每条价格必须与唯一户型绑定
 *   2. 同一户型多条价格 → 取平均
 *   3. 缺少户型信息 → 暂不上架，生成缺失清单
 *   4. 输出格式：{小区名称}|{户型ID}|{租金(元/月)}|{更新时间}
 *
 * 用法：npx tsx scripts/process-pricing.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── 类型定义 ───

interface RawEntry {
  communityName: string;
  layout: string;
  rentType: 'shared' | 'whole';
  price: number;
  date: string;
  source: string;
  _comment?: string; // 示例条目标记
}

interface RoomPricing {
  layout: string;
  shared: number;
  whole: number;
}

interface Community {
  id: string;
  name: string;
  price: { min: number; max: number; unit: string };
  layouts?: string[];
  roomPricing?: RoomPricing[];
  [key: string]: unknown;
}

// ─── 主流程 ───

function main() {
  // 1. 读取数据
  const rawPath = resolve(ROOT, 'data', 'raw-pricing.json');
  const communitiesPath = resolve(ROOT, 'data', 'communities.json');

  const rawEntries: RawEntry[] = JSON.parse(readFileSync(rawPath, 'utf8'));
  const communities: Community[] = JSON.parse(readFileSync(communitiesPath, 'utf8'));

  // 过滤掉示例条目
  const validEntries = rawEntries.filter(e => !e._comment && e.communityName && e.layout && e.price > 0);

  if (validEntries.length === 0) {
    console.log('⚠️  raw-pricing.json 中没有有效数据。请补充数据后重新运行。');
    console.log('');
    console.log('数据格式：');
    console.log(JSON.stringify({
      communityName: '小区名（必须与 communities.json 完全一致）',
      layout: '户型（如：一室一厅）',
      rentType: 'shared 或 whole',
      price: 3000,
      date: '2026-04-05',
      source: '链家',
    }, null, 2));
    return;
  }

  // 2. 建立小区名 → Community 映射
  const communityMap = new Map<string, Community>();
  communities.forEach(c => communityMap.set(c.name, c));

  // 3. 分组：小区 → 户型 → 租法 → 价格列表
  //    key: `${communityName}|${layout}|${rentType}`
  const grouped = new Map<string, {
    communityName: string;
    layout: string;
    rentType: 'shared' | 'whole';
    prices: number[];
    latestDate: string;
    sources: Set<string>;
  }>();

  const missingCommunities: string[] = [];
  const missingLayouts: { community: string; layout: string }[] = [];

  for (const entry of validEntries) {
    const { communityName, layout, rentType, price, date, source } = entry;

    // 检查小区是否存在
    const community = communityMap.get(communityName);
    if (!community) {
      if (!missingCommunities.includes(communityName)) {
        missingCommunities.push(communityName);
      }
      continue;
    }

    // 检查户型是否在小区的 layouts 列表中
    const layouts = community.layouts || [];
    if (layouts.length > 0 && !layouts.includes(layout)) {
      missingLayouts.push({ community: communityName, layout });
      continue;
    }

    const key = `${communityName}|${layout}|${rentType}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.prices.push(price);
      if (date > existing.latestDate) {
        existing.latestDate = date;
      }
      existing.sources.add(source);
    } else {
      grouped.set(key, {
        communityName,
        layout,
        rentType,
        prices: [price],
        latestDate: date,
        sources: new Set([source]),
      });
    }
  }

  // 4. 计算平均价格，更新 communities
  //    先聚合到 roomPricing 结构
  const roomPricingMap = new Map<string, Map<string, RoomPricing>>();
  // key: communityName → value: Map(layout → RoomPricing)

  const outputLines: string[] = [];

  for (const [, group] of grouped) {
    const avgPrice = Math.round(
      group.prices.reduce((sum, p) => sum + p, 0) / group.prices.length
    );

    if (!roomPricingMap.has(group.communityName)) {
      roomPricingMap.set(group.communityName, new Map());
    }
    const layoutMap = roomPricingMap.get(group.communityName)!;

    if (!layoutMap.has(group.layout)) {
      layoutMap.set(group.layout, { layout: group.layout, shared: 0, whole: 0 });
    }
    const rp = layoutMap.get(group.layout)!;
    rp[group.rentType] = avgPrice;

    // 输出行：{小区名称}|{户型ID}|{租金}|{更新时间}
    outputLines.push(`${group.communityName}|${group.layout}|${avgPrice}|${group.latestDate}`);
  }

  // 5. 写回 communities.json
  let updatedCount = 0;
  for (const community of communities) {
    const layoutMap = roomPricingMap.get(community.name);
    if (!layoutMap) continue;

    const roomPricing = Array.from(layoutMap.values());
    community.roomPricing = roomPricing;

    // 同步更新 layouts 列表
    const layouts = roomPricing.map(rp => rp.layout);
    community.layouts = [...new Set([...(community.layouts || []), ...layouts])];

    // 更新概览价格（取所有价格的 min/max）
    const allPrices = roomPricing.flatMap(rp => [rp.shared, rp.whole]).filter(p => p > 0);
    if (allPrices.length > 0) {
      community.price = {
        min: Math.min(...allPrices),
        max: Math.max(...allPrices),
        unit: '月',
      };
    }

    updatedCount++;
  }

  writeFileSync(communitiesPath, JSON.stringify(communities, null, 2) + '\n');

  // 6. 输出报告
  console.log('═══════════════════════════════════════════');
  console.log('  租金数据处理报告');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log(`📊 输入：${validEntries.length} 条原始数据`);
  console.log(`✅ 已更新：${updatedCount} 个小区`);
  console.log(`📋 输出格式：{小区名称}|{户型ID}|{租金(元/月)}|{更新时间}`);
  console.log('');
  console.log('─── 价格清单 ───');
  outputLines.forEach(line => console.log(line));
  console.log('');

  if (missingCommunities.length > 0) {
    console.log('─── ⚠️ 未找到的小区 ───');
    missingCommunities.forEach(name => console.log(`  - ${name}`));
    console.log('');
    console.log('请在 communities.json 中添加这些小区，或修正名称后重新运行。');
    console.log('');
  }

  if (missingLayouts.length > 0) {
    console.log('─── ⚠️ 缺少户型映射（暂未上架） ───');
    missingLayouts.forEach(({ community, layout }) => {
      console.log(`  - ${community} → ${layout}`);
    });
    console.log('');
    console.log('请在 communities.json 对应小区的 layouts 中添加这些户型，或修正户型名称后重新运行。');
    console.log('');
  }

  console.log('═══════════════════════════════════════════');
  console.log(`✅ communities.json 已更新，共 ${updatedCount} 个小区`);
  console.log('   运行 npm run build 验证后部署即可。');
  console.log('═══════════════════════════════════════════');
}

main();
