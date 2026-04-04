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

- 主数据：`data/communities.json`
- 原始/备份：`data/communities_raw.json`、`data/communities.json.bak`
- 类型定义：`types/community.ts`

坐标格式统一为 `[lng, lat]`（GCJ-02）。

## 常用脚本

- `node scripts/geocode-communities.js`  
  根据小区名称调用高德接口更新坐标，写回 `communities.json`

- `node scripts/extract-coords.js`  
  从高德短链提取坐标并回填数据

- `node scripts/process-data.js <input.json>`  
  一次性清洗/转换数据

## 更新数据前后建议

更新前：

- 备份 `communities.json`
- 确认 `.env.local` 中高德 Key 可用

更新后：

- 抽样检查坐标顺序（避免 lat/lng 反转）
- 本地打开地图核对 3~5 个小区点位
- 跑 `npm run lint && npm run build`
