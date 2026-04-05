# 项目文档索引

本目录用于沉淀项目的维护文档，按”开发者最常见问题”组织：

- 我如何把项目跑起来？→ `quickstart.md`
- 页面和地图联动逻辑在哪？→ `architecture.md`
- 数据库结构和管理？→ `architecture.md`（数据库层章节）+ `data-maintenance.md`
- 为什么默认中心会漂、怎么校准？→ `debugging.md`
- 数据库连接出问题怎么排查？→ `debugging.md`（数据库连接排查章节）
- 小区数据怎么更新？→ `data-maintenance.md`
- Openclaw 租房文本怎么入库并生成向量？→ `rental-vectorization.md`
- 租房数据怎么归档、备份与命名？→ `data-archive-policy.md`
- Openclaw 接口怎么调用？→ `openclaw-guide.md`
- 如何保证发布质量并上线/回滚？→ `testing-and-release.md`

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
2. 线上定位异常排查：`debugging.md`
3. 更新小区数据：`data-maintenance.md`
4. 接入租房文本：`rental-vectorization.md` → `openclaw-guide.md`
5. 上线前检查：`testing-and-release.md`

## 当前稳定性结论（2026-04）

- 已增加地图容器与视口同步机制，降低窗口状态切换导致的点击偏移
- 已提供调试面板与坐标采点能力，可复现并定位坐标漂移问题
- 已提供桌面端中心修正的可视化微调与持久化能力
- 已新增 Openclaw 租房向量化处理链路、增量存储、趋势分析与反馈机制
- **已下线全部价格和户型信息**，等待原始数据通过 `raw-pricing.json` 补充后重新上架
- 租金处理脚本：`npx tsx scripts/process-pricing.ts`（同一户型多条价格取平均，缺少户型暂不上架）
- 已完成 SEO 优化（canonical、Open Graph、JSON-LD 结构化数据）
- 已修复 A11y 问题（图片 alt 属性、表单标签关联）

- 已增加地图容器与视口同步机制，降低窗口状态切换导致的点击偏移
- 已提供调试面板与坐标采点能力，可复现并定位坐标漂移问题
- 已提供桌面端中心修正的可视化微调与持久化能力
- 已新增 Openclaw 租房向量化处理链路、增量存储、趋势分析与反馈机制
