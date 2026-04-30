const fs = require('fs');

const inputPath = process.argv[2];
if (!inputPath) {
  process.stderr.write('Usage: node scripts/process-data.js <input.json>\n');
  process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

// 按小区分组
const communityMap = new Map();

rawData.forEach(item => {
  const name = item['小区'] || '未知小区';
  
  if (!communityMap.has(name)) {
    communityMap.set(name, {
      name: name,
      distance: item['与公司距离'] || '未知',
      units: [],
      highlights: [],
      warnings: [],
      contributors: [],
      updatedAt: item['更新年份'] || '未知'
    });
  }
  
  const community = communityMap.get(name);
  
  // 添加户型信息
  community.units.push({
    layout: item['总户型'] || '未知',
    price: item['价格/月（含服务费）'] || 0,
    area: item['使用面积'] || item['建筑面积'] || '未知',
    floor: item['楼层'] || '未知',
    elevator: item['电梯数量'] !== undefined && item['电梯数量'] !== 0
  });
  
  // 收集贡献者
  if (item['贡献者'] && !community.contributors.includes(item['贡献者'])) {
    community.contributors.push(item['贡献者']);
  }
  
  // 提取优点
  const goodFields = ['隔音', '采光', '通风', '水压', '小区绿化', '小区新旧'];
  goodFields.forEach(field => {
    if (item[field] && ['好', '很好', '非常好', '不错', '高', '正常'].includes(item[field])) {
      const highlight = field + item[field];
      if (!community.highlights.includes(highlight)) {
        community.highlights.push(highlight);
      }
    }
  });
  
  // 提取注意事项
  const badFields = ['隔音', '采光', '通风', '水压'];
  badFields.forEach(field => {
    if (item[field] && ['差', '很差', '一般', '低', '小'].includes(item[field])) {
      const warning = field + item[field];
      if (!community.warnings.includes(warning)) {
        community.warnings.push(warning);
      }
    }
  });
  
  // 从"其他"字段提取信息
  if (item['其他']) {
    const other = item['其他'];
    if (other.includes('吵') || other.includes('噪音')) {
      if (!community.warnings.includes('可能有噪音')) community.warnings.push('可能有噪音');
    }
    if (other.includes('方便') || other.includes('便利')) {
      if (!community.highlights.includes('生活便利')) community.highlights.push('生活便利');
    }
    if (other.includes('近地铁') || other.includes('近公司')) {
      if (!community.highlights.includes('交通便利')) community.highlights.push('交通便利');
    }
  }
  
  // 更新年份
  if (item['更新年份'] > community.updatedAt) {
    community.updatedAt = item['更新年份'];
  }
});

// 转换为数组并计算价格范围
const communities = Array.from(communityMap.values()).map(c => {
  const prices = c.units.filter(u => typeof u.price === 'number').map(u => u.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  
  // 提取户型类型
  const layouts = [...new Set(c.units.map(u => u.layout))];
  
  // 检查是否有电梯
  const hasElevator = c.units.some(u => u.elevator);
  
  return {
    id: c.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-').toLowerCase(),
    name: c.name,
    coordinates: [121.5144, 31.2988],
    distance: c.distance,
    bikeTime: '约' + (parseFloat(c.distance) || 2) * 5 + '分钟',
    price: {
      min: minPrice,
      max: maxPrice,
      unit: '月'
    },
    floorTypes: hasElevator ? ['有电梯'] : ['无电梯'],
    layouts: layouts.slice(0, 4),
    elevator: hasElevator,
    highlights: c.highlights.slice(0, 5),
    warnings: c.warnings.slice(0, 3),
    contributor: c.contributors.slice(0, 3).join(', '),
    updatedAt: String(c.updatedAt)
  };
});

// 按距离排序
communities.sort((a, b) => {
  const distA = parseFloat(a.distance) || 999;
  const distB = parseFloat(b.distance) || 999;
  return distA - distB;
});

console.log(JSON.stringify(communities, null, 2));
