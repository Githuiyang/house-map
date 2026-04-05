# 单间价格功能说明

> 让实习生和合租党一眼看到每间房多少钱

---

## 功能概述

**问题**：实习生租房时需要知道"合租后每间房多少钱"，但地图只显示总价

**解决方案**：自动计算并显示单间价格

**计算公式**：
```
单间价格 = 总价 ÷ 房间数
```

---

## 使用方法

### 1. 计算单间价格

```bash
cd ~/Downloads/office-map
node scripts/calculate-price-per-room.js
```

**输出**：
```
✅ 已更新 28 个小区的单间价格数据
📊 新增字段:
   - roomPricing[].rooms: 房间数
   - roomPricing[].pricePerRoom: 单间价格
   - pricePerRoomStats: {min, max, avg}
```

### 2. 查看单间价格排行榜

```bash
cat memory/topics/rental-price-ranking.md
```

### 3. 地图查看

访问 https://map.lihuiyang.xyz，hover 小区标记即可看到：
```
距离：0.9km · 骑行5分钟
单间均价：2250元/月
```

---

## 数据结构

### RoomPricing 接口

```typescript
interface RoomPricing {
  layout: string;        // "一室一厅"、"两室一厅"等
  rooms?: number;        // 房间数（1-4）⭐ 新增
  pricePerRoom?: number; // 单间价格（元/月）⭐ 新增
  shared: number;        // 合租价格（元/月）
  whole: number;         // 整租价格（元/月）
  area?: string;         // 面积（如 "44平"）
  note?: string;         // 备注（如 "复式"）
}
```

### PricePerRoomStats 接口

```typescript
interface PricePerRoomStats {  // ⭐ 新增
  min: number;  // 最低单间价格
  max: number;  // 最高单间价格
  avg: number;  // 平均单间价格
}
```

### 示例数据

```json
{
  "name": "吉浦路615弄",
  "layouts": ["一室", "两室一厅"],
  "price": {
    "min": 4100,
    "max": 6300,
    "unit": "月"
  },
  "roomPricing": [
    {
      "layout": "一室",
      "rooms": 1,
      "pricePerRoom": 4100,
      "whole": 4100,
      "shared": 0
    },
    {
      "layout": "两室一厅",
      "rooms": 2,
      "pricePerRoom": 2050,
      "whole": 4100,
      "shared": 0
    }
  ],
  "pricePerRoomStats": {
    "min": 2050,
    "max": 4100,
    "avg": 3075
  }
}
```

---

## 房间数识别规则

脚本会自动识别房间数：

| 户型 | 房间数 | 示例 |
|------|--------|------|
| 一室、一房、一居 | 1间 | 一室一厅 → 1间 |
| 两室、二室、两房、两居 | 2间 | 两室一厅 → 2间 |
| 三室、三居 | 3间 | 三室两厅 → 3间 |
| 四室、四居 | 4间 | 四室两卫 → 4间 |

---

## 显示逻辑

### 地图 Hover Tooltip

**优先级**：
1. `pricePerRoomStats.avg`（统计平均值）
2. `roomPricing[0].pricePerRoom`（第一个户型的单间价格）
3. 回退到总价（作为整租价格显示）

**显示文本**：
- 有单间数据：`单间均价：2250元/月`
- 无单间数据：`价格：4.5k元/月`

**代码实现**：
```typescript
// components/MapView.tsx
const getPerRoomPriceText = (community: Community): string => {
  // 优先使用 pricePerRoomStats.avg
  if (community.pricePerRoomStats?.avg) {
    const avg = community.pricePerRoomStats.avg;
    return avg >= 1000 ? `${Math.round(avg / 1000)}k` : `${avg}`;
  }
  
  // 回退到 roomPricing 的第一个有效单间价格
  if (community.roomPricing && community.roomPricing.length > 0) {
    const firstWithPerRoom = community.roomPricing.find(r => r.pricePerRoom && r.pricePerRoom > 0);
    if (firstWithPerRoom && firstWithPerRoom.pricePerRoom) {
      const price = firstWithPerRoom.pricePerRoom;
      return price >= 1000 ? `${Math.round(price / 1000)}k` : `${price}`;
    }
  }
  
  // 最后回退到总价
  return formatPrice(community.price.min, community.price.max);
};

const hasPerRoomData = community.pricePerRoomStats?.avg || 
  (community.roomPricing && community.roomPricing.some(r => r.pricePerRoom && r.pricePerRoom > 0));

const tooltipContent = `
  <div class="${styles.hoverTooltip}">
    <div class="${styles.tooltipRow}">${distText}</div>
    <div class="${styles.tooltipRow}">${hasPerRoomData ? '单间均价' : '价格'}：${perRoomPriceText}元/月</div>
  </div>
`;
```

---

## 单间价格排行榜

**TOP 5 性价比之王**：

| 排名 | 小区 | 户型 | 单间价格 | 距离 | 电梯 |
|------|------|------|----------|------|------|
| 1 | 吉浦路615弄 | 两室一厅 | **2050元/间** | 2.65km | ✅ |
| 2 | 创智坊 | 四室两卫 | **2250元/间** | 0.3km ⭐ | ✅ |
| 3 | 国定路700弄 | 两室一厅 | **2250元/间** | 1.0km | ❌ |
| 4 | 三门路358弄 | 两室一厅 | **2650元/间** | 2.0km | ❌ |
| 5 | 仁和苑 | 四室 | **2675元/间** | 0.6km | ❌ |

**实习生推荐**：
- **创智坊 四室两卫**：2250元/间，0.3km，有电梯 ⭐ **最优选择**
- **吉浦路615弄 两室一厅**：2050元/间，2.65km（骑行11分钟）⭐ **最便宜**

**完整排行榜**：见 `memory/topics/rental-price-ranking.md`

---

## 数据统计（2026-04-05）

- **小区总数**：51个
- **有单间数据**：28个小区
- **无单间数据**：23个小区（显示总价）
- **单间价格范围**：2050-8000元/间
- **TOP 10平均**：2854元/间

---

## 省钱攻略

### 1. 合租比整租便宜 50-70%

**示例对比**：
- 整租（一室）：4500-5600元/间
- 合租（两室）：2650-2900元/间
- 合租（四室）：2250-2675元/间

### 2. 大户型单价更便宜

**示例**：
- 创智坊 四室两卫：2250元/间 ⭐
- 创智坊 两室两厅：4500元/间

### 3. 距离 vs 价格权衡

| 小区 | 距离 | 单间价格 | 差价 |
|------|------|----------|------|
| 创智坊 | 0.3km | 2250元 | 基准 |
| 吉浦路 | 2.65km | 2050元 | -200元 |

**结论**：多走600m，省200元/月

---

## 维护指南

### 新增房源时

1. 添加房源数据到 `communities.json`
2. 运行单间价格计算：
   ```bash
   node scripts/calculate-price-per-room.js
   ```
3. 验证数据：
   ```bash
   node scripts/validate-communities.js
   ```
4. 推送上线：
   ```bash
   git add data/communities.json
   git commit -m "feat: 更新租房数据"
   git push origin main
   ```

### 重新计算所有单间价格

```bash
node scripts/calculate-price-per-room.js
git add data/communities.json
git commit -m "chore: 重新计算单间价格"
git push
```

---

## 相关文件

- **计算脚本**：`scripts/calculate-price-per-room.js`
- **数据文件**：`data/communities.json`
- **排行榜**：`memory/topics/rental-price-ranking.md`
- **类型定义**：`types/community.ts`
- **地图组件**：`components/MapView.tsx`
- **数据维护**：`docs/data-maintenance.md`

---

## 技术细节

### 计算脚本实现

```javascript
// scripts/calculate-price-per-room.js
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

// 计算每个户型的单间价格
communities.forEach(c => {
  if (c.price && c.price.min > 0 && c.layouts && c.layouts.length > 0) {
    c.layouts.forEach(layout => {
      const rooms = getRoomCount(layout);
      const pricePerRoom = Math.round(c.price.min / rooms);
      
      // 更新 roomPricing
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
  }
});
```

---

_最后更新: 2026-04-05_
_相关文档: [数据维护指南](./data-maintenance.md) | [架构文档](./architecture.md)_
