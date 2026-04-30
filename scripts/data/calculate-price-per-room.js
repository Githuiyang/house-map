#!/usr/bin/env node
/**
 * 计算每个户型的单间价格
 * 用法: node scripts/calculate-price-per-room.js
 */

const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../../data/communities.json');
const communities = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// 户型 → 房间数映射
function getRoomCount(layout) {
  if (!layout) return 1;
  
  const layoutStr = layout.toLowerCase();
  
  // 匹配 "X室"
  const match = layoutStr.match(/(\d+)[室居室房]/);
  if (match) return parseInt(match[1]);
  
  // 中文数字
  if (layoutStr.includes('四室') || layoutStr.includes('四居')) return 4;
  if (layoutStr.includes('三室') || layoutStr.includes('三居')) return 3;
  if (layoutStr.includes('两室') || layoutStr.includes('二室') || layoutStr.includes('两居')) return 2;
  
  return 1; // 默认1间
}

// 为每个小区的每个户型计算单间价格
let updated = 0;
communities.forEach(c => {
  if (c.price && c.price.min > 0 && c.layouts && c.layouts.length > 0) {
    // 更新 roomPricing
    if (!c.roomPricing) c.roomPricing = [];
    
    c.layouts.forEach(layout => {
      const rooms = getRoomCount(layout);
      const pricePerRoom = Math.round(c.price.min / rooms);
      
      // 查找是否已有该户型的定价
      const existing = c.roomPricing.find(r => r.layout === layout);
      if (existing) {
        existing.rooms = rooms;
        existing.pricePerRoom = pricePerRoom;
      } else {
        c.roomPricing.push({
          layout,
          rooms,
          pricePerRoom,
          shared: 0,
          whole: c.price.min
        });
      }
    });
    
    // 添加统计字段
    const prices = c.roomPricing.map(r => r.pricePerRoom).filter(p => p > 0);
    if (prices.length > 0) {
      c.pricePerRoomStats = {
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      };
    }
    
    updated++;
  }
});

// 保存
fs.writeFileSync(dataPath, JSON.stringify(communities, null, 2), 'utf8');

console.log(`✅ 已更新 ${updated} 个小区的单间价格数据`);
console.log(`📊 新增字段:`);
console.log(`   - roomPricing[].rooms: 房间数`);
console.log(`   - roomPricing[].pricePerRoom: 单间价格`);
console.log(`   - pricePerRoomStats: {min, max, avg}`);
