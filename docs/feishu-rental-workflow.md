# 飞书租房线索后台方案

> 最后更新：2026-05-01

## 推荐结论

**飞书多维表格（Bitable）作为租房线索的审核后台和备用数据库**，替代自建 Supabase 直连方案。

### 为什么选飞书

| 维度 | 自建方案 | 飞书 Base |
|------|---------|-----------|
| 新建文件 | ~20 个（API 路由、Admin 页面、存储层） | **0 个**（飞书原生 UI） |
| 管理后台 | 500+ 行 React | **飞书原生 Grid/Kanban** |
| 移动端审核 | 需要响应式开发 | **飞书 App 原生** |
| 部署依赖 | Vercel + Supabase 都要配 | **仅飞书账号** |

核心简化：把"审核后台"从"自己开发"变成"用飞书现成的"。

### 飞书适合 / 不适合

**适合**：原始线索存储、人工审核界面、多人协作、移动端操作、数据备份归档

**不适合**：高并发实时查询、自动触发网站部署、替代 git 版本控制、替代 communities.json 的构建时数据源

### 飞书能力概览

- 20+ 字段类型（文本/数字/单选/多选/日期/关联/公式）
- API batch_create 一次 500 条
- 免费额度：单表 50,000 行（远超当前 53 个社区需求）
- Grid / Kanban / Gallery / Gantt / Form 五种视图

---

## 数据流

```
Openclaw 采集文本 → 飞书 Base（审核） → CSV 追加 → sync-csv.js → communities.json → Git → Vercel
```

关键原则：

1. **飞书是人类操作的界面**，不是网站的数据库
2. **CSV 是唯一数据源（SSOT）**，飞书是审核中间层
3. **同步是手动触发的**，用户说"同步"时 Codex 执行
4. **网站代码不需要改动**，复用现有 sync-csv.js → validate → build 流程

详细同步步骤见 [Codex 飞书同步指南](./codex-feishu-sync-guide.md)。

---

## 飞书 Base 表结构

### 表一：Raw Leads（原始线索）

| 字段名 | 字段类型 | 用途 | 必填 | 同步到网页 |
|--------|---------|------|------|-----------|
| `record_id` | Auto Number | 自动编号 | 自动 | 否 |
| `raw_text` | Text | Openclaw 采集的原始文本 | **是** | 否 |
| `source` | Single Select | 来源：Openclaw / 手动录入 / 中介推荐 | 否 | 否 |
| `batch_date` | Date | 导入日期 | 自动 | 否 |
| `status` | Single Select | 待解析 / 已解析 / 解析失败 / 已忽略 | **是** | 否 |
| `parse_note` | Text | 解析备注 | 否 | 否 |
| `linked_candidate` | Link → Parsed Candidates | 关联的解析记录 | 自动 | - |
| `imported_by` | Created By | 谁导入的 | 自动 | 否 |

### 表二：Parsed Candidates（解析候选）

| 字段名 | 字段类型 | 用途 | 必填 | 同步到网页 |
|--------|---------|------|------|-----------|
| `record_id` | Auto Number | 自动编号 | 自动 | 否 |
| `raw_lead` | Link → Raw Leads | 关联的原始线索 | **是** | 否 |
| `community_name` | Text | 解析出的社区名称 | **是** | **是** |
| `community_match` | Single Select | 已知社区 / 新社区 / 模糊匹配 / 无法匹配 | **是** | **是**（间接） |
| `community_id` | Text | 匹配到的 communities.json ID（slug） | 否 | **是** |
| `price` | Number | 月租金（元） | **是** | **是** |
| `price_type` | Single Select | 整租 / 合租 / 参考价 | **是** | **是** |
| `area` | Number | 面积（m²） | 否 | **是** |
| `layout` | Text | 户型（如"2室1厅"） | 否 | **是** |
| `orientation` | Multi Select | 朝向：南/北/东/西/东南/西南/南北通透 | 否 | **是** |
| `decoration` | Single Select | 装修：精装/简装/毛坯/豪装/婚房装修 | 否 | **是** |
| `floor_type` | Single Select | 楼层类型：多层/高层/低层/复式 | 否 | **是** |
| `elevator` | Checkbox | 是否有电梯 | 否 | **是** |
| `highlights` | Multi Select | 亮点标签 | 否 | **是** |
| `warnings` | Multi Select | 注意事项标签 | 否 | **是** |
| `amenities` | Multi Select | 配套设施 | 否 | 否 |
| `contact_info` | Text | 中介联系方式（**绝不进入网页**） | 否 | **否** |
| `move_in_date` | Text | 入住时间 | 否 | 否 |
| `quality_score` | Number | 字段完整度评分 0-100 | 自动 | 否 |
| `confidence` | Single Select | 高/中/低 | 自动 | 否 |
| `status` | Single Select | 见状态流转 | **是** | - |
| `review_note` | Text | 审核备注 | 否 | 否 |
| `reviewed_at` | Date | 审核时间 | 否 | 否 |
| `dedup_hash` | Text | 去重哈希 | 自动 | 否 |
| `parsed_at` | Created Time | 解析时间 | 自动 | 否 |

### 表三：Publish Queue（发布队列）

| 字段名 | 字段类型 | 用途 | 必填 | 同步到网页 |
|--------|---------|------|------|-----------|
| `record_id` | Auto Number | 自动编号 | 自动 | 否 |
| `candidate` | Link → Parsed Candidates | 关联的解析记录 | **是** | - |
| `community_name` | Text | 目标社区名称 | **是** | **是** |
| `community_id` | Text | 目标社区 ID | 否 | **是** |
| `action` | Single Select | 新增社区 / 更新价格 / 更新户型 / 更新亮点 / 忽略 | **是** | **是** |
| `csv_row_data` | Text | 预生成的 CSV 行内容 | 自动 | **是** |
| `publish_status` | Single Select | 待发布 / 已发布 / 发布失败 / 已过期 | **是** | - |
| `published_at` | Date | 实际发布时间 | 否 | 否 |
| `published_by` | Text | 执行同步的人/Codex | 否 | 否 |
| `expire_date` | Date | 过期时间（默认 90 天） | 自动 | 否 |
| `rollback_note` | Text | 回滚说明 | 否 | 否 |

### 三表关联

```
Raw Leads (1) → (N) Parsed Candidates (1) → (1) Publish Queue
```

---

## 状态流转

### 状态定义

| 状态 | 颜色 | 说明 |
|------|------|------|
| 待解析 | 灰色 | 原始线索刚导入 |
| 已解析 | - | NLP 解析成功 |
| 解析失败 | 红色 | 无法提取社区名或价格 |
| 自动通过 | 绿色 | quality_score >= 80 + 已知社区 |
| 待审核 | 黄色 | 不满足自动通过条件 |
| 人工通过 | 蓝色 | 人工确认数据正确 |
| 待补充 | 黄色 | 信息不完整需补充 |
| 待发布 | 黄色 | 审核通过，等待同步到网页 |
| 已发布 | 绿色 | 已同步到网页 |
| 发布失败 | 红色 | 同步过程出错 |
| 疑似重复 | 橙色 | dedup_hash 与已有记录相同 |
| 已忽略 | 灰色 | 确认不适用 |
| 已过期 | 灰色 | 超过 expire_date |

### 状态转换规则

| 从 | 到 | 触发条件 | 操作人 |
|----|-----|---------|--------|
| 待解析 | 已解析 | NLP 解析成功 | 自动 |
| 待解析 | 解析失败 | 无法提取社区名或价格 | 自动 |
| 已解析 | 自动通过 | quality_score >= 80 且 community_match = 已知社区 | 自动 |
| 已解析 | 待审核 | 不满足自动通过条件 | 自动 |
| 已解析 | 疑似重复 | dedup_hash 已存在 | 自动 |
| 待审核 | 人工通过 | 人工确认正确 | 用户 |
| 待审核 | 待补充 | 信息不完整 | 用户 |
| 待审核 | 已忽略 | 确认不适用 | 用户 |
| 待补充 | 待审核 | 补充后重新提交 | 用户 |
| 自动通过 | 待发布 | 自动流转 | 自动 |
| 人工通过 | 待发布 | 自动流转 | 自动 |
| 待发布 | 已发布 | Codex 同步完成 | Codex |
| 待发布 | 发布失败 | 同步出错 | Codex |
| 已发布 | 已过期 | 超过 expire_date | 自动/手动 |
| 疑似重复 | 已忽略 | 确认重复 | 用户 |
| 任意 | 已忽略 | 人工决定忽略 | 用户 |

---

## 同步到网页的规则

### 可同步条件（全部满足）

- status = 待发布（必须经过审核）
- community_name 非空
- price > 0
- community_match 为已知社区或新社区
- 新社区必须有坐标（不能为 [0,0]）
- contact_info 不在同步范围

### 必须人工确认

| 场景 | 处理 |
|------|------|
| 新小区 | 人工确认社区名 + 补坐标 |
| 坐标缺失 | 手动标注或高德 API 补全 |
| 价格异常（偏离均价 >50%） | 人工确认价格 |
| 小区名低置信度 | 人工确认匹配 |

### 绝不进入网页的数据

`raw_text`、`contact_info`、`source`、`imported_by`、`review_note`、`dedup_hash`、`quality_score` — 这些字段永远不离开飞书。

---

## 分阶段实施计划

### P0：文档化（已完成）

- 本文档 + Codex 同步指南 + 文档导航更新 + 旧文件清理

### P1：创建飞书 Base（已完成 2026-04-30）

- **Base 名称**：租房线索管理
- **Base Token**：通过 `FEISHU_BASE_TOKEN` 环境变量配置
- **访问链接**：飞书 Base 链接（本地私有记录）
- **表 ID**（通过环境变量配置）：
  - Raw Leads：`FEISHU_RAW_LEADS_TABLE_ID`
  - Parsed Candidates：`FEISHU_PARSED_CANDIDATES_TABLE_ID`
  - Publish Queue：`FEISHU_PUBLISH_QUEUE_TABLE_ID`
- 创建工具：`lark-cli base +base-create` + `+table-create`
- 已包含 3 条示例数据（国定路财大小区 / 国年路25弄 / 三门路）
- 待完成：用户权限授权（需 `lark-cli auth login --as user`）、Kanban 视图

### P2A：飞书 Publish Queue → CSV dry-run 预览（已完成 2026-04-30）

- **脚本**：`scripts/data/feishu-to-csv-preview.js`
- **测试**：`scripts/data/feishu-to-csv-preview.test.ts`（Vitest，52 个测试全通过）
- **功能**：读取 Publish Queue 中 `publish_status = "待发布"` 的记录，通过 `candidate` Link 获取关联 Parsed Candidates，映射为 CSV 行格式并预览
- **约束**：只读 dry-run，不写 CSV、不写 communities.json、不回写飞书状态
- **字段映射规则**：
  - `decoration` 同时写入"装修"列和"特色标签"（兼容 `sync-csv.js` 的 `cleanHighlights`）
  - 多选字段用中文顿号 `、` 连接（避免破坏 `sync-csv.js` 的 `line.split(",")` 解析）
  - `elevator` 布尔值 → `有电梯`/`无电梯`/空字符串
  - 禁止字段（`contact_info`、`raw_text`、`source` 等）绝不进入预览
- **用法**：`node scripts/data/feishu-to-csv-preview.js --dry-run`

### P2B：飞书 → CSV 实际写入（脚本已就绪，队列为空，2026-05-01）

- `--write` 模式已实现：CSV 追加写入 + preflight 预检 + 安全校验
- 创建指南已完成（见 `docs/codex-feishu-sync-guide.md` → "如何创建一条可发布记录"）
- 72 个测试全通过（52 feishu + 20 其他）
- 当前 Publish Queue 为空，等待用户或 Openclaw 产生 `publish_status = "待发布"` 的记录后执行实际写入

### P2C：飞书状态回写 + 完整部署流程（待实现）

- 成功：`publish_status` → `已发布`，`published_at` → 当前时间
- 失败：`publish_status` → `发布失败`，`rollback_note` → 错误信息
- git commit + push → Vercel 自动部署

---

## 风险点

| 风险 | 缓解措施 |
|------|----------|
| 飞书 API 限流 | 单表写入串行化；批量读取每次 500 条 |
| CSV 编码问题 | 确认编码格式一致 |
| 新社区坐标缺失 | 必须人工确认坐标 |
| 重复数据 | dedup_hash 去重 + sync-csv.js 去重 |
| 中介隐私泄露 | contact_info 字段明确排除 |
| 飞书不可用 | CSV + Git 可独立工作 |
| Vercel 构建不依赖飞书 | 网站数据来自静态 JSON |
