# 项目文档索引

本目录用于沉淀项目的维护文档，按"开发者最常见问题"组织：

- 我如何把项目跑起来？→ `quickstart.md`
- 页面和地图联动逻辑在哪？→ `architecture.md`
- 数据库结构和管理？→ `architecture.md`（数据库层章节）+ `data-maintenance.md`
- 为什么默认中心会漂、怎么校准？→ `ops/debugging.md`
- 数据库连接出问题怎么排查？→ `ops/debugging.md`（数据库连接排查章节）
- 小区数据怎么更新？→ `data-maintenance.md`
- 单间价格功能说明？→ `price-per-room-feature.md`（历史文档，代码示例可能过时）
- Openclaw 租房文本怎么入库并生成向量？→ `rental-vectorization.md`
- 租房数据怎么归档、备份与命名？→ `data-archive-policy.md`
- Openclaw 接口怎么调用？→ `openclaw-guide.md`
- **飞书租房后台方案（推荐）**：→ `feishu-rental-workflow.md`
- **Codex 如何把飞书数据同步到网页？**→ `codex-feishu-sync-guide.md`
- 如何保证发布质量并上线/回滚？→ `ops/testing-and-release.md`
- 下一步该做什么？→ `../NEXT_STEPS.md`

## 运维文档

`docs/ops/` 目录存放运维相关文档：

- `ops/debugging.md`：调试面板、坐标漂移排查、数据库连接排查
- `ops/testing-and-release.md`：CI、E2E、Vercel 部署与回滚

## 目录职责速查

| 目录 | 职责 |
|------|------|
| `app/` | Next.js App Router 页面入口 |
| `components/` | UI 组件（MapView、FilterBar、CommunityCard） |
| `src/db/` | 数据库层（Supabase PostgreSQL + Drizzle ORM） |
| `src/lib/` | 服务端工具函数 |
| `data/` | 运行时数据（communities.json、CSV 数据源） |
| `data/archive/` | 历史备份 |
| `data/reports/` | 数据比对报告、测试日志 |
| `scripts/data/` | 数据同步、价格处理脚本 |
| `scripts/geo/` | 地理编码、坐标匹配脚本 |
| `scripts/validate/` | 数据校验脚本 |
| `scripts/archive/` | 一次性/历史脚本 |
| `tools/` | 租房向量化管线（rental-pipeline） |
| `types/` | TypeScript 类型定义 |
| `docs/` | 项目文档 |
| `docs/ops/` | 运维文档 |
| `drizzle/` | Drizzle Kit 迁移文件 |
| `e2e/` | E2E 测试 |
| `public/` | 静态资源 |

## 数据库概览

- **数据库**: Supabase PostgreSQL（东京区域）
- **驱动**: postgres.js
- **ORM**: Drizzle ORM（pg-core 方言）
- **连接串**: `DATABASE_URL` 环境变量
- **Schema**: `src/db/schema.ts`
- **连接初始化**: `src/db/index.ts`
- **迁移配置**: `drizzle.config.ts`
- **迁移文件**: `drizzle/`

## 建议阅读顺序

1. 新同学首次接手：`quickstart.md` → `architecture.md`
2. 线上定位异常排查：`ops/debugging.md`
3. 更新小区数据：`data-maintenance.md`
4. 接入租房文本：`rental-vectorization.md` → `openclaw-guide.md`
5. 上线前检查：`ops/testing-and-release.md`

## 当前稳定性结论（2026-04）

- 已增加地图容器与视口同步机制，降低窗口状态切换导致的点击偏移
- 已提供调试面板与坐标采点能力，可复现并定位坐标漂移问题
- 已提供桌面端中心修正的可视化微调与持久化能力
- 已新增 Openclaw 租房向量化处理链路、增量存储、趋势分析与反馈机制
- **价格和户型已上架**：截至当前数据快照，53 个小区中 36 个含 roomPricing、13 个含 pricePerRoomStats，列表卡片显示单间均价，详情卡片显示价格表；当前无坐标缺失（三门路48弄、北茶园已于 2026-04-30 补全）
- **CSV→JSON 同步**：`data/房源数据存档.csv` 为唯一数据源, 通过 `scripts/data/sync-csv.js` 同步到 `communities.json`
- 租金同步脚本：`node scripts/data/sync-csv.js`（`--dry-run` 预览差异）
- 飞书同步：`node scripts/data/feishu-to-csv-preview.js --dry-run`（P2A+P2B 已完成，读取飞书待发布记录并映射为 CSV 行；`--write` 写入 CSV）
- 已完成 SEO 优化（canonical、Open Graph、JSON-LD 结构化数据）
- 已修复 A11y 问题（图片 alt 属性、表单标签关联）
