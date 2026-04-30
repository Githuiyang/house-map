#!/usr/bin/env node
/**
 * 验证 communities.json 数据格式
 */
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../../data/communities.json');
const communities = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

let errors = [];
let warnings = [];

communities.forEach((c, i) => {
  const prefix = `[${i}] ${c.name || c.id}`;
  
  // 必填字段
  if (!c.id) errors.push(`${prefix}: 缺少 id`);
  if (!c.name) errors.push(`${prefix}: 缺少 name`);
  if (!c.coordinates || c.coordinates.length !== 2) {
    errors.push(`${prefix}: coordinates 格式错误`);
  }
  if (!c.price || typeof c.price.min !== 'number') {
    errors.push(`${prefix}: price.min 缺失或格式错误`);
  }
  if (!c.layouts || c.layouts.length === 0) {
    warnings.push(`${prefix}: layouts 为空`);
  }
  
  // 坐标范围（上海：经度 121-122，纬度 31-32）
  const [lng, lat] = c.coordinates || [];
  if (lng < 120 || lng > 122) {
    warnings.push(`${prefix}: 经度 ${lng} 可能异常`);
  }
  if (lat < 30 || lat > 32) {
    warnings.push(`${prefix}: 纬度 ${lat} 可能异常`);
  }
  
  // 新字段提醒（不影响功能）
  if (c.layouts && c.layouts.some(l => l.includes('半') || l.includes('房'))) {
    console.log(`ℹ️  ${prefix}: 使用非标准户型 "${c.layouts.join(', ')}"，确保前端支持`);
  }
});

if (errors.length > 0) {
  console.error('❌ 数据验证失败：');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('⚠️  警告：');
  warnings.forEach(w => console.warn(`  - ${w}`));
}

console.log(`✅ 数据验证通过：${communities.length} 个小区`);
