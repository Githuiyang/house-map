const https = require('https');
const fs = require('fs');
const path = require('path');

// 短链接列表
const shortLinks = {
  '仁和苑': 'https://surl.amap.com/crpufNg45IH',
  '文化花园': 'https://surl.amap.com/cuhAbayIaZV',
  '正文花园': 'https://surl.amap.com/cwsIY5485SG',
  '国和一村': 'https://surl.amap.com/cuVgeAa1faf2',
  '创智坊': 'https://surl.amap.com/cxKV6Iiw9Ag',
};

// 解析短链接获取坐标
function extractCoords(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const location = res.headers.location;
      if (location) {
        // 解析 URL 参数
        const match = location.match(/p=([^%]+)%2C([\d.]+)%2C([\d.]+)/);
        if (match) {
          const lat = parseFloat(match[2]);
          const lon = parseFloat(match[3]);
          resolve([lon, lat]);
        } else {
          reject(new Error('无法解析坐标'));
        }
      } else {
        reject(new Error('没有重定向'));
      }
    }).on('error', reject);
  });
}

// 主函数
async function main() {
  const coords = {};
  
  for (const [name, url] of Object.entries(shortLinks)) {
    try {
      const [lon, lat] = await extractCoords(url);
      coords[name] = [lon, lat];
      console.log(`${name}: [${lon.toFixed(6)}, ${lat.toFixed(6)}]`);
    } catch (error) {
      console.error(`${name}: ${error.message}`);
    }
  }
  
  // 读取并更新数据
  const dataPath = path.join(__dirname, '../data/communities.json');
  const communities = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  
  let updatedCount = 0;
  communities.forEach(c => {
    if (coords[c.name]) {
      c.coordinates = coords[c.name];
      updatedCount++;
    }
  });
  
  // 保存
  fs.writeFileSync(dataPath, JSON.stringify(communities, null, 2), 'utf8');
  console.log(`\n✅ 已更新 ${updatedCount} 个小区的坐标`);
}

main().catch(console.error);
