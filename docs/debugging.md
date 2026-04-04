# 坐标与调试指南

## 调试模式开启

- URL 加 `?debug=1`
- 或 `localStorage.office-map-debug=1` 后刷新

## 面板里最关键的字段

- `center`：地图当前中心点
- `company`：公司坐标
- `distanceMeters`：中心与公司的偏移距离
- `containerRect`：地图容器在页面中的尺寸和位置
- `pointer` / `amapClick`：点击链路信息
- `hitTest`：实际命中的 DOM 元素

## 常见异常与判断

1. `distanceMeters` 很大但 `center` 不变  
   表示中心逻辑偏移，检查桌面修正参数。

2. `container.h` 异常大（例如几千）  
   表示页面高度链路异常，优先查布局容器是否被内容撑开。

3. `hitTest.inMap = false`  
   表示点击被覆盖层吃掉，不是地图坐标转换问题。

4. 只有 `dom:click` 没有 `amap:click`  
   可能是地图层事件在某些状态未触发，先看 DOM 兜底数据。

## 桌面修正策略

- 默认以公司居中为目标
- 桌面端支持“基线 / 关闭 / 微调方向 / 快速对齐”
- 微调后会持久化到 localStorage，刷新不丢失

## 推荐排查流程

1. 刷新页面后立即复制一份 debug JSON
2. 在 768px 附近反复拖动窗口并再次复制
3. 对比 `containerRect`、`distanceMeters`、`label` 序列
4. 若仅桌面偏移，使用桌面修正微调并固化

## 数据库连接排查

项目使用 Supabase PostgreSQL（东京区域），通过 `DATABASE_URL` 环境变量连接。

常见问题：

1. **连接超时**
   - 检查 `DATABASE_URL` 是否正确配置
   - 确认 Supabase 项目状态（是否暂停，免费套餐会自动暂停）
   - 检查网络是否能访问 `aws-0-ap-northeast-1.pooler.supabase.com:6543`

2. **Schema 不匹配**
   - 本地运行 `npx drizzle-kit push` 同步 schema
   - 检查 `src/db/schema.ts` 与实际数据库表是否一致
   - 使用 `npx drizzle-kit studio` 可视化检查表结构

3. **SSL 错误**
   - 确保连接串包含 `?sslmode=require`

排查工具：

```bash
# 检查数据库连接（需安装 drizzle-kit）
npx drizzle-kit push --dry-run

# 可视化管理数据库
npx drizzle-kit studio

# 查看 schema 差异
npx drizzle-kit generate
```
