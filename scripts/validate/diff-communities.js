#!/usr/bin/env node
/**
 * 对比 communities.json 变更
 * 用法：
 *   node scripts/diff-communities.js          # 详细变更
 *   node scripts/diff-communities.js --short  # 简短摘要
 */
const { execSync } = require('child_process');
const path = require('path');

const shortMode = process.argv.includes('--short');

try {
  const diff = execSync(
    'git diff data/communities.json',
    { encoding: 'utf-8', cwd: path.join(__dirname, '../..') }
  );
  
  if (!diff.trim()) {
    console.log('没有变更');
    process.exit(0);
  }
  
  // 解析变更
  const lines = diff.split('\n');
  let added = 0, removed = 0, modified = 0;
  const addedNames = [];
  
  lines.forEach(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      if (line.includes('"name":')) {
        const match = line.match(/"name":\s*"([^"]+)"/);
        if (match) addedNames.push(match[1]);
      }
      added++;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      removed++;
    }
  });
  
  // 估算新增数量（每个小区约 20 行）
  const newCommunities = Math.floor(addedNames.length);
  
  if (shortMode) {
    console.log(`+${newCommunities} 小区：${addedNames.join(', ')}`);
  } else {
    console.log('📊 数据变更摘要：');
    console.log(`  新增行数：${added}`);
    console.log(`  删除行数：${removed}`);
    if (newCommunities > 0) {
      console.log(`  新增小区：${addedNames.join(', ')}`);
    }
    console.log('\n详细 diff：');
    console.log(diff);
  }
} catch (e) {
  // 没有变更时 git diff 会报错
  console.log('没有变更');
}
