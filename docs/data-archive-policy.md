# 数据归档整理规范

## 目录结构

租房向量化系统默认使用以下目录：

```text
data/
  rental-system/
    current-snapshot.json
    history-events.json
    feedback.json
    reports/
      latest-report.json
    backups/
      2026-03-29T08-00-00-000Z.json
```

## 文件职责

- `current-snapshot.json`：当前最新的房源与小区聚合结果
- `history-events.json`：增量写入、合并、恢复等操作历史
- `feedback.json`：人工反馈记录
- `reports/latest-report.json`：最近一次趋势报告
- `backups/*.json`：按时间戳备份的历史快照

## 命名规则

- 目录名统一使用短横线风格
- 备份文件名统一使用 ISO 时间戳并把 `:` 与 `.` 替换为 `-`
- 小区 ID 使用中文 slug 化结果，如 `国年路25弄 -> 国年路25弄`
- 房源记录 ID 使用 SHA1 截断，保证跨系统导入时稳定

## 归档标准

- 原始输入始终保留在 `rawText`
- 所有自动抽取结果写入 `parsed`
- 所有向量化结果写入 `vector`
- 所有校验结果写入 `validation`
- 每条数据必须具备 `capturedAt`、`firstSeenAt`、`lastSeenAt`

## 版本管理

- 同一去重键重复进入时，不新增平铺记录，而是更新：
  - `seenCount`
  - `version`
  - `lastSeenAt`
- 如果房源显著变化且去重键变化，应产生新记录

## 备份恢复要求

- 每次 ingest 前必须自动备份
- 恢复动作必须写入 `history-events.json`
- 备份文件禁止人工覆盖，出现修订时应生成新文件

## 存储路径建议

- 本地开发：仓库内 `data/rental-system/`
- 生产环境：建议挂载持久卷，或周期性同步到对象存储
- 项目已使用 Supabase PostgreSQL（东京区域）作为主数据库，schema 定义在 `src/db/schema.ts`，通过 Drizzle ORM 操作
- 租房系统的文件数据（`data/rental-system/`）仍以 JSON 文件形式存储，后续可考虑迁移到数据库
