# 数据维护指南

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
