# 项目文档索引

本目录用于沉淀项目的维护文档，按“开发者最常见问题”组织：

- 我如何把项目跑起来？→ `quickstart.md`
- 页面和地图联动逻辑在哪？→ `architecture.md`
- 为什么默认中心会漂、怎么校准？→ `debugging.md`
- 小区数据怎么更新？→ `data-maintenance.md`
- Openclaw 租房文本怎么入库并生成向量？→ `rental-vectorization.md`
- 租房数据怎么归档、备份与命名？→ `data-archive-policy.md`
- Openclaw 接口怎么调用？→ `openclaw-guide.md`
- 如何保证发布质量并上线/回滚？→ `testing-and-release.md`

## 建议阅读顺序

1. 新同学首次接手：`quickstart.md` → `architecture.md`
2. 线上定位异常排查：`debugging.md`
3. 更新小区数据：`data-maintenance.md`
4. 接入租房文本：`rental-vectorization.md` → `openclaw-guide.md`
5. 上线前检查：`testing-and-release.md`

## 当前稳定性结论（2026-03）

- 已增加地图容器与视口同步机制，降低窗口状态切换导致的点击偏移
- 已提供调试面板与坐标采点能力，可复现并定位坐标漂移问题
- 已提供桌面端中心修正的可视化微调与持久化能力
- 已新增 Openclaw 租房向量化处理链路、增量存储、趋势分析与反馈机制
