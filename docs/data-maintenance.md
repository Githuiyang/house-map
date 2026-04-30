# 数据维护指南

## 数据库

项目使用 **Supabase PostgreSQL**（东京区域）存储小区评论与图片等数据。

- 连接配置：`src/db/index.ts`（postgres.js 驱动 + Drizzle ORM）
- 表定义：`src/db/schema.ts`（`drizzle-orm/pg-core` 方言）
- 迁移配置：`drizzle.config.ts`
- 迁移文件：`drizzle/`

数据库表：

- `community_comments`：小区评论
- `community_images`：小区图片

常用数据库操作：

```bash
# 推送 schema 变更到数据库（开发用）
npx drizzle-kit push

# 生成迁移文件
npx drizzle-kit generate

# 运行迁移（生产推荐）
npx drizzle-kit migrate

# 可视化管理
npx drizzle-kit studio
```

## 数据文件

- **唯一数据源**：`data/房源数据存档.csv`（CSV 是 Single Source of Truth）
- 前端数据：`data/communities.json`（由 `scripts/data/sync-csv.js` 从 CSV 同步生成）
- 备份：`data/archive/communities.json.bak`
- 类型定义：`types/community.ts`

坐标格式统一为 `[lng, lat]`（GCJ-02 坐标系）。

### CSV 格式

```csv
小区名称,户型,面积(平),租金类型,租金价格(元/月),价格类型,楼层,装修,特色标签,信息来源,录入时间,电梯,备注
```

同步规则：
- 只追加/更新，不删除历史记录
- 亮点自动清洗（移除价格信息、租房流程描述）
- 自动计算 `pricePerRoomStats`（排除一室户）

---

## 数据处理脚本

### 1. 添加小区（`scripts/data/add-community.js`）

**用途**：交互式添加新小区，自动获取精确坐标

**流程**：
1. 输入小区信息（名称、户型、价格、电梯等）
2. 调用高德 API 获取精确坐标
3. 自动计算距离（Haversine公式）
4. 标准化数据格式
5. 写入 `communities.json`

**使用**：
```bash
node scripts/data/add-community.js
```

---

### 2. 单间价格计算（`scripts/data/calculate-price-per-room.js`）⭐ 新功能

**用途**：自动计算每个户型的单间价格

**计算公式**：
```
单间价格 = 总价 ÷ 房间数
```

**房间数识别**：
- 一室/一房 → 1间
- 两室/二室/两房 → 2间
- 三室 → 3间
- 四室 → 4间

**新增字段**：
- `roomPricing[].rooms`：房间数
- `roomPricing[].pricePerRoom`：单间价格
- `pricePerRoomStats`：统计信息（min/max/avg）

**使用**：
```bash
node scripts/data/calculate-price-per-room.js
```

**输出示例**：
```json
{
  "name": "吉浦路615弄",
  "roomPricing": [
    {
      "layout": "一室",
      "rooms": 1,
      "pricePerRoom": 4100,
      "whole": 4100
    },
    {
      "layout": "两室一厅",
      "rooms": 2,
      "pricePerRoom": 2050,
      "whole": 4100
    }
  ],
  "pricePerRoomStats": {
    "min": 2050,
    "max": 4100,
    "avg": 3075
  }
}
```

**用户价值**：
- 实习生和合租党一眼就能看到每间房多少钱
- 地图 hover 直接显示单间均价
- 单间价格排行榜（见 `docs/price-per-room-feature.md`）

---

### 3. 数据验证（`scripts/validate/validate-communities.js`）

**用途**：验证数据格式和完整性

**检查项**：
- 必需字段是否存在（id、name、coordinates、price）
- coordinates 格式是否正确（[lng, lat]）
- price.min 和 price.max 是否合理
- layouts 是否为空（警告，不报错）

**使用**：
```bash
node scripts/validate/validate-communities.js
```

**输出示例**：
```
⚠️  警告：
  - [0] 北郊小区: layouts 为空
  - [3] 东方锦园: layouts 为空
✅ 数据验证通过：53 个小区
```

---

### 4. 数据对比（`scripts/validate/diff-communities.js`）

**用途**：生成数据变更摘要

**对比项**：
- 新增小区
- 删除小区
- 价格变化
- 户型变化

**使用**：
```bash
node scripts/validate/diff-communities.js
```

---

### 5. 一键同步（`scripts/data/sync-data.sh`）

**用途**：验证 → 提交 → 推送 一键完成

**流程**：
1. 运行数据验证
2. Git 添加变更
3. 生成变更摘要（commit message）
4. 推送到 GitHub
5. Vercel 自动部署

**使用**：
```bash
bash scripts/data/sync-data.sh
```

---

## 数据维护流程

### 标准流程

1. **接收房源信息**：
   - 记录原始文本到 `rental-data-log.md`
   - 提取关键信息（小区、户型、价格等）

2. **添加/更新数据**：
   ```bash
   node scripts/data/add-community.js
   ```
   或手动编辑 `data/communities.json`

3. **计算单间价格**：
   ```bash
   node scripts/data/calculate-price-per-room.js
   ```

4. **验证数据**：
   ```bash
   node scripts/validate/validate-communities.js
   ```

5. **推送上线**：
   ```bash
   bash scripts/data/sync-data.sh
   ```
   或手动：
   ```bash
   git add data/communities.json
   git commit -m "feat: 更新租房数据"
   git push origin main
   ```

---

### 坐标修正流程

**问题场景**：小区位置不准确

**修正方法**：
1. 获取精确坐标（用户提供或高德地图查询）
2. 更新 `communities.json` 中的 `coordinates` 字段
3. 重新计算距离（运行脚本或手动更新）
4. 验证 → 提交 → 推送

**示例**：
```bash
# 手动更新坐标
jq 'map(if .id == "jipulu-615nong" then . + {"coordinates": [121.492319, 31.316575]} else . end)' data/communities.json > /tmp/fixed.json
mv /tmp/fixed.json data/communities.json

# 验证
node scripts/validate/validate-communities.js

# 推送
git add data/communities.json && git commit -m "fix: 修正吉浦路615弄坐标" && git push
```

---

## 常用脚本

| 脚本 | 用途 |
|------|------|
| `scripts/data/sync-csv.js` | **CSV→JSON 同步（推荐）**：`node scripts/data/sync-csv.js` 或 `--dry-run` |
| `scripts/data/recalc-price-per-room.ts` | 重算所有社区的 `pricePerRoomStats` |
| `scripts/data/add-community.js` | 交互式添加新小区，自动获取精确坐标 |
| `scripts/geo/geocode-communities.js` | 批量用高德 API 补全/更新坐标 |
| `scripts/validate/validate-communities.js` | 验证数据格式和完整性 |
| `scripts/validate/diff-communities.js` | 生成数据变更摘要 |
| `scripts/archive/cleanup-data.js` | 清洗 highlights、重算统计数据 |
| `scripts/data/process-pricing.ts` | 旧流程：raw-pricing.json → communities.json（已被 CSV 同步替代） |
| `scripts/data/sync-data.sh` | 一键同步：验证 → 提交 → 推送 |

---

## 数据质量改进记录

### 2026-04-05

**修正路名错误**：
- "浦路615弄" → "吉浦路615弄"（上海杨浦区真实路名）
- "正明路" → "政民路"
- "镇通路" → "政通路"

**坐标修正**：
- 公园3000·黄兴花园：[121.55, 31.28] → [121.523217, 31.292219]
- 吉浦路615弄：[121.5145, 31.2995] → [121.492319, 31.316575]

**户型标准化**：
- "一房一厅" → "一室一厅"
- "一室半" → "一室"
- "两房一厅" → "两室一厅"

**数据清理**：
- 清空2026年前的旧价格数据（避免影响当前展示）
- 保留所有小区基础信息

---

## 参考文档

- **单间价格排行榜**：`docs/price-per-room-feature.md`
- **类型定义**：`types/community.ts`
