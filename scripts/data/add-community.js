#!/usr/bin/env node
/**
 * 为新增小区自动获取精确坐标
 * 用法: node scripts/add-community.js "小区名" "户型" 价格 [是否有电梯]
 * 示例: node scripts/add-community.js "国顺路400弄" "一室半" 4300 false
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 参数
const [,, name, layouts, price, hasElevator] = process.argv;

if (!name || !layouts || !price) {
  console.log('用法: node scripts/add-community.js "小区名" "户型" 价格 [是否有电梯]');
  console.log('示例: node scripts/add-community.js "国顺路400弄" "一室半" 4300 false');
  process.exit(1);
}

// 读取 API key
const envPath = path.join(__dirname, '../../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const apiKeyMatch = envContent.match(/NEXT_PUBLIC_AMAP_KEY=(.+)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;

if (!apiKey) {
  console.error('❌ 未找到 NEXT_PUBLIC_AMAP_KEY');
  process.exit(1);
}

// HTTP GET
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// 地理编码
async function geocode(name) {
  const queries = [
    name,
    `${name}小区`,
    `上海杨浦区${name}`,
    `上海市${name}`,
  ];
  
  for (const query of queries) {
    const url = `https://restapi.amap.com/v3/geocode/geo?key=${apiKey}&address=${encodeURIComponent(query)}`;
    const data = await httpGet(url);
    
    if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
      const location = data.geocodes[0].location;
      if (location) {
        const [lon, lat] = location.split(',').map(Number);
        if (lon >= 120.8 && lon <= 122 && lat >= 30.6 && lat <= 31.9) {
          return [lon, lat];
        }
      }
    }
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

// 生成 ID
function generateId(name) {
  return name
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// 计算距离（Haversine 公式）
function calculateDistance(coords) {
  const company = [121.510327, 31.303071]; // 公司坐标
  const R = 6371; // 地球半径（km）
  const [lon1, lat1] = company;
  const [lon2, lat2] = coords;
  
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return `${distance.toFixed(1)}km`;
}

async function main() {
  console.log(`🔍 正在获取「${name}」的精确坐标...\n`);
  
  const coords = await geocode(name);
  
  if (!coords) {
    console.error('❌ 未找到坐标，请检查小区名或手动提供坐标');
    process.exit(1);
  }
  
  console.log(`✅ 坐标: ${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`);
  
  const distance = calculateDistance(coords);
  const bikeTime = Math.round(parseFloat(distance) * 3); // 粗略估算骑行时间
  
  const community = {
    id: generateId(name),
    name,
    coordinates: coords,
    distance,
    bikeTime: `${bikeTime}分钟`,
    price: {
      min: parseInt(price),
      max: parseInt(price),
      unit: "月"
    },
    floorTypes: ["多层"],
    layouts: layouts.split('/'),
    elevator: hasElevator === 'true',
    highlights: [],
    warnings: [],
    contributor: "老大",
    updatedAt: new Date().getFullYear().toString(),
    roomPricing: layouts.split('/').map(l => ({
      layout: l,
      shared: 0,
      whole: 0
    })),
    geocodeSource: 'amap',
    geocodeAt: new Date().toISOString().split('T')[0]
  };
  
  // 读取现有数据
  const dataPath = path.join(__dirname, '../../data/communities.json');
  const communities = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  communities.push(community);
  
  // 保存
  fs.writeFileSync(dataPath, JSON.stringify(communities, null, 2), 'utf8');
  
  console.log(`\n✅ 已添加到 communities.json（共 ${communities.length} 个小区）`);
  console.log('\n小区信息：');
  console.log(JSON.stringify(community, null, 2));
}

main().catch(console.error);
