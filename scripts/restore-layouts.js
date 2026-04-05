#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const backup = JSON.parse(fs.readFileSync(path.join(dataDir, 'communities.json.bak'), 'utf8'));
const current = JSON.parse(fs.readFileSync(path.join(dataDir, 'communities.json'), 'utf8'));

// 创建备份的 name -> layouts 映射
const layoutMap = {};
backup.forEach(c => {
  layoutMap[c.name] = c.layouts;
});

// 恢复 layouts
let restored = 0;
current.forEach(c => {
  if (layoutMap[c.name] && layoutMap[c.name].length > 0) {
    c.layouts = layoutMap[c.name];
    // 同步更新 roomPricing
    if (!c.roomPricing) c.roomPricing = [];
    c.layouts.forEach(layout => {
      if (!c.roomPricing.find(r => r.layout === layout)) {
        c.roomPricing.push({ layout, shared: 0, whole: 0 });
      }
    });
    restored++;
  }
});

// 标准化户型命名
const standardMap = {
  '一房一厅': '一室一厅',
  '一室半': '一室',
  '两房一厅': '两室一厅',
  '二房一厅': '两室一厅'
};

current.forEach(c => {
  c.layouts = c.layouts.map(l => standardMap[l] || l);
  if (c.roomPricing) {
    c.roomPricing = c.roomPricing.map(r => ({
      ...r,
      layout: standardMap[r.layout] || r.layout
    }));
  }
});

fs.writeFileSync(path.join(dataDir, 'communities.json'), JSON.stringify(current, null, 2), 'utf8');
console.log(`✅ 恢复了 ${restored} 个小区的 layouts 数据`);
console.log(`✅ 标准化了户型命名`);
console.log(`✅ 当前共 ${current.length} 个小区`);
