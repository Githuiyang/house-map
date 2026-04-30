const fs = require('fs');
const path = require('path');

// 读取配置
const envPath = path.join(__dirname, '../../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const apiKeyMatch = envContent.match(/NEXT_PUBLIC_AMAP_KEY=(.+)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;

if (!apiKey) {
  console.error('未找到 API key');
  process.exit(1);
}

// 读取小区数据
const dataPath = path.join(__dirname, '../../data/communities.json');
const communities = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log(`开始获取 ${communities.length} 个小区的坐标...\n`);

// 延迟函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 获取坐标 - 尝试多种方式
async function geocode(name) {
  // 尝试不同的搜索关键词
  const queries = [
    name,
    `${name}小区`,
    `上海杨浦区${name}`,
    `上海市杨浦区${name}`,
  ];
  
  for (const query of queries) {
    // 用地理编码 API
    const geocodeUrl = `https://restapi.amap.com/v3/geocode/geo?key=${apiKey}&address=${encodeURIComponent(query)}`;
    
    try {
      const response = await fetch(geocodeUrl);
      const data = await response.json();
      
      if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
        const location = data.geocodes[0].location;
        if (location) {
          const [lon, lat] = location.split(',').map(Number);
          return [lon, lat];
        }
      }
    } catch (error) {
      // 继续尝试下一个
    }
    
    await sleep(100);
  }
  
  // 如果地理编码也找不到，尝试 POI 搜索
  const poiUrl = `https://restapi.amap.com/v3/place/text?key=${apiKey}&keywords=${encodeURIComponent(name)}&city=上海&citylimit=true&offset=1`;
  
  try {
    const response = await fetch(poiUrl);
    const data = await response.json();
    
    if (data.status === '1' && data.pois && data.pois.length > 0) {
      const location = data.pois[0].location;
      if (location) {
        const [lon, lat] = location.split(',').map(Number);
        return [lon, lat];
      }
    }
  } catch (error) {
    // 忽略错误
  }
  
  return null;
}

// 主函数
async function main() {
  const updated = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < communities.length; i++) {
    const community = communities[i];
    console.log(`[${i + 1}/${communities.length}] ${community.name}`);
    
    const coords = await geocode(community.name);
    
    if (coords) {
      community.coordinates = coords;
      console.log(`  ✅ ${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`);
      successCount++;
    } else {
      console.log(`  ⚠️  未找到，保留原坐标`);
      failCount++;
    }
    
    updated.push(community);
    
    // 延迟避免频率限制
    if (i < communities.length - 1) {
      await sleep(200);
    }
  }
  
  // 保存更新后的数据
  fs.writeFileSync(dataPath, JSON.stringify(updated, null, 2), 'utf8');
  console.log(`\n✅ 完成！成功: ${successCount}, 失败: ${failCount}`);
}

main().catch(console.error);
