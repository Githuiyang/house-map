# Codex 飞书同步指南

> 当用户说"把飞书新增信息同步到网页"时，Codex / Agent 应执行以下流程。
> 最后更新：2026-05-01

## 前置约束

- **原始中介联系方式不进入网页**（contact_info 字段不参与同步）
- **未审核数据不能同步**（只有 publish_status = "待发布" 的记录才能处理）
- **新小区坐标缺失不能发布**（coordinates 为 [0,0] 时不允许同步）
- **写入飞书状态属于云端修改**，执行前必须获得用户确认

## Base 信息

以下标识符通过环境变量配置（见 `docs/codex-feishu-sync-guide.md` → "环境变量配置"），不再硬编码：

- **Base Token**：`FEISHU_BASE_TOKEN`
- **Publish Queue 表 ID**：`FEISHU_PUBLISH_QUEUE_TABLE_ID`
- **Parsed Candidates 表 ID**：`FEISHU_PARSED_CANDIDATES_TABLE_ID`
- 访问链接：飞书 Base 链接（本地私有记录）

---

## 同步流程（8 步）

### 前置条件

- **必须先成功运行 `--dry-run`**，再执行 `--write`。`--write` 模式内置 preflight 检查（CSV 路径可写、行校验通过），但 dry-run 是用户侧最终确认。
- **lark-cli 认证必须正常**。如果 `--dry-run` 输出 keychain 错误，说明 lark-cli 未初始化，需先执行：
  1. `lark-cli config init`
  2. `lark-cli auth login`
  3. 重新运行脚本

### 步骤 1：读取飞书 Publish Queue

- 用 `/lark-base` skill 读取 Publish Queue 表
- 筛选 `publish_status = "待发布"` 的记录
- 如果没有待发布记录，告知用户"没有新的待发布数据"，**结束**

### 步骤 2：预览变更

展示每条待发布记录的关键字段：

| 展示项 | 来源字段 |
|--------|---------|
| 社区名 | `community_name` |
| 价格 | `price` |
| 户型 | `layout` |
| 面积 | `area` |
| 操作类型 | `action`（新增社区 / 更新价格 / 更新户型 / 更新亮点 / 忽略） |

标注哪些是**新增社区**，哪些是**更新已有社区**。

**等待用户确认后才继续。**

### 步骤 2.5：dry-run 预览（可选但推荐）

```bash
node scripts/data/feishu-to-csv-preview.js --dry-run
```

此脚本读取 Publish Queue 中 `publish_status = "待发布"` 的记录，通过 `candidate` Link 获取关联 Parsed Candidates 的字段，映射为 CSV 行格式并输出预览。

**关键映射规则**：
- `decoration` 同时写入"装修"列和"特色标签"（兼容 `sync-csv.js` 的 `cleanHighlights`）
- 多选字段用中文顿号 `、` 连接（避免破坏 `sync-csv.js` 的 `line.split(",")` 解析）
- `elevator` 布尔值 → `有电梯`/`无电梯`/空字符串
- 禁止字段（`contact_info`、`raw_text`、`source` 等）绝不进入预览

纯函数已导出供测试：`mapToCsvRow`、`extractSelect`、`derivePriceType`、`csvRowToString`、`containsForbiddenField`、`sanitizeCsvCell`、`validateCsvRow`、`parseRecordListResult`、`parseRecordGetResult`、`parseCliError`、`normalizeCliError`、`buildCsvDuplicateKey`、`loadExistingCsvKeys`、`findDuplicateCandidates`

测试：`scripts/data/feishu-to-csv-preview.test.ts`（Vitest，69 个测试）

### 步骤 3：写入 CSV

- 将每条记录转换为 CSV 格式（见下方字段映射表）
- **追加**到 `data/房源数据存档.csv`（不覆盖现有数据）
- 编码保持与现有 CSV 一致（UTF-8，不加 BOM）

**CSV 安全校验**（`sync-csv.js` 用 `line.split(",")` 解析，不支持引号转义）：
- 含英文逗号 `,`、换行 `\n`、回车 `\r`、双引号 `"` 的行会被标记为 **BLOCKED**，不写入
- 中文逗号 `，` 和中文顿号 `、` 是安全的
- 不使用双引号包裹（sync-csv.js 无法解析）

```bash
# 使用 --write 标志执行实际写入
node scripts/data/feishu-to-csv-preview.js --write

# 写入 + 自动回写飞书状态为已发布（推荐）
node scripts/data/feishu-to-csv-preview.js --write --mark-published
```

**防重复发布保护**：

脚本内置三层去重机制：

| 层级 | 状态标记 | 说明 |
|------|----------|------|
| 飞书状态过滤 | — | 只读取 `publish_status = "待发布"` 的记录 |
| CSV 层去重 | `BLOCKED_DUPLICATE` | 追加前检查 CSV 中是否已有相同行（社区+户型+面积+价格+价格类型+来源+年份） |
| 队列内去重 | `BLOCKED_DUPLICATE_QUEUE` | 同一 candidate 被多条 Publish Queue 关联时，只保留第一条 |

**`--mark-published` 回写机制**：

- 配合 `--write` 使用，在 CSV 追加成功后自动回写飞书 `publish_status = "已发布"`
- 逐条回写：成功计为成功数，失败仅记录但不回滚 CSV
- 不使用 `--mark-published` 时，需手动回写飞书状态（步骤 7）

### 步骤 4：预览同步结果

```bash
node scripts/data/sync-csv.js --dry-run
```

展示输出，让用户确认变更内容。

### 步骤 5：执行同步

```bash
node scripts/data/sync-csv.js
```

检查输出：新增了几个社区？更新了几个社区？

### 步骤 6：验证

依次执行：

```bash
node scripts/validate/validate-communities.js
npm run lint
npm run typecheck
npm run build
```

任何一步失败则中止，进入错误处理。

### 步骤 7：回写飞书状态

> 如果步骤 3 使用了 `--mark-published`，飞书状态已自动回写，可跳过本步。

**执行前必须获得用户确认**（这是云端修改）。

用 `/lark-base` skill 更新 Publish Queue：

- 成功的记录：`publish_status` → `"已发布"`，`published_at` → 当前时间
- 失败的记录：`publish_status` → `"发布失败"`，`rollback_note` → 错误信息

### 步骤 8：提交部署

```bash
git add data/房源数据存档.csv data/communities.json
git commit -m "feat: 同步飞书审核通过的新增房源数据"
git push origin main
```

等待 Vercel 自动部署，告知用户同步完成。

---

## 字段映射（飞书 → CSV）

| 飞书字段 | CSV 列 | 转换规则 |
|---------|--------|---------|
| `community_name` | 小区名称 | 直接 |
| `layout` | 户型 | 直接 |
| `area` | 面积(平) | 数字 → 字符串 |
| `price_type` | 租金类型 | 直接 |
| `price` | 租金价格(元/月) | 数字 → 字符串 |
| （推导） | 价格类型 | 根据价格类型推导 |
| `floor_type` | 楼层 | 直接 |
| `decoration` | 装修 | 写入"装修"列，同时合并进"特色标签" |
| `highlights` | 特色标签 | 多选 → 中文顿号 `、` 分隔字符串 |
| （固定） | 信息来源 | `"Openclaw"` |
| （当前日期） | 录入时间 | 当前年 |
| `elevator` | 电梯 | `true` → `"有电梯"`，`false` → `"无电梯"` |
| `warnings` | 备注 | 多选 → 中文顿号 `、` 分隔字符串 |

**以下字段绝不写入 CSV**：`raw_text`、`contact_info`、`source`、`imported_by`、`review_note`、`dedup_hash`、`quality_score`

---

## 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| lark-cli keychain not initialized | 脚本会展示 type/message/hint + 解决步骤，exit 1 |
| lark-cli 返回嵌套错误对象 | `normalizeCliError` 自动展开 `{ error: { type, message, hint } }` |
| sync-csv.js 报错 | 中止流程，不回写飞书状态 |
| validate 发现数据问题 | 中止流程，展示具体错误 |
| build 失败 | 中止流程，不提交 |
| 飞书 API 写入失败 | 标记为"发布失败"，保留本地 CSV 变更 |
| git push 失败 | 保留本地提交，告知用户手动 push |
| Preflight 检查失败 | 中止写入，不触碰 CSV 文件，exit 1 |

---

## 如何创建一条可发布记录

> 本节说明如何在飞书 Base 中手动创建一条能够被 `--dry-run` 识别并最终 `--write` 的记录。
> 本节仅供文档参考，**不要自动写入飞书**。

### 前置知识：三表关系

```
Raw Leads ──(raw_lead Link)──→ Parsed Candidates ──(candidate Link)──→ Publish Queue
```

同步脚本只关心 **Publish Queue** 和 **Parsed Candidates**。Raw Leads 是可选的溯源记录。

### 各表最小必填字段

#### Raw Leads（可选，建议填写以便溯源）

| 字段 | 最小值 | 说明 |
|------|--------|------|
| `raw_text` | `三林世博家园 2500元 15㎡ 南 精装` | 原始采集文本 |
| `source` | `Openclaw` | 来源 |
| `status` | `已解析` | 标记已处理 |

#### Parsed Candidates（必须）

| 字段 | 最小值 | 说明 |
|------|--------|------|
| `community_name` | `三林世博家园` | 社区名，必须非空 |
| `price` | `2500` | 月租金（数字），必须 > 0 |
| `price_type` | `整租` | 单选：整租 / 合租 / 参考价 |
| `layout` | `1室1厅` | 户型（建议填写） |
| `area` | `15` | 面积（建议填写） |

推荐一并填写以获得更高质量评分：`decoration`、`highlights`、`warnings`、`floor_type`、`elevator`。

#### Publish Queue（必须）

| 字段 | 最小值 | 说明 |
|------|--------|------|
| `candidate` | 选择一条 Parsed Candidates 记录 | **Link 关联**，脚本通过此字段获取候选数据 |
| `community_name` | `三林世博家园` | 目标社区名 |
| `action` | `更新价格` | 操作类型 |
| `publish_status` | **`待发布`** | **必须是此值**，脚本只筛选 `待发布` |

### 绝不能进入网页的字段

以下字段在同步脚本中被 `containsForbiddenField()` 检查，**绝不会写入 CSV**：

`contact_info`、`raw_text`、`source`、`imported_by`、`review_note`、`dedup_hash`、`quality_score`

**特别注意**：`contact_info`（中介联系方式）即使填写在飞书中也不会泄露到网页。

### 操作步骤（在飞书客户端操作）

1. 打开飞书 Base（链接见本地私有记录）
2. **Parsed Candidates 表**：点击"+"添加一条新记录，填写上述最小字段
3. **Publish Queue 表**：点击"+"添加一条新记录：
   - `candidate` 列点击选择刚创建的 Parsed Candidates 记录
   - `community_name` 填写目标社区名
   - `action` 选择操作类型
   - `publish_status` **必须选择"待发布"**
4. 回到终端执行 `node scripts/data/feishu-to-csv-preview.js --dry-run` 验证

### 新小区注意事项

如果 `community_name` 是 `data/communities.json` 中不存在的社区：

- `community_match` 应设为 `新社区`
- **必须先补坐标**：新小区坐标为 `[0,0]` 时不允许同步
- 补坐标方式：在飞书中填写，或由 Codex 通过高德 API 补全后更新 `communities.json`
- 建议使用**已有小区**测试流程，避免坐标问题

### 最小示例（文档用途，不执行）

假设为已有小区"三林世博家园"添加一条新价格信息：

**Parsed Candidates 新记录**：

| 字段 | 值 |
|------|-----|
| community_name | 三林世博家园 |
| price | 2500 |
| price_type | 合租 |
| area | 15 |
| layout | 1室1厅 |
| decoration | 精装 |
| highlights | 近地铁、采光好 |
| warnings | 无阳台 |

**Publish Queue 新记录**：

| 字段 | 值 |
|------|-----|
| candidate | （选择上面的 Parsed Candidates 记录） |
| community_name | 三林世博家园 |
| action | 更新价格 |
| publish_status | 待发布 |

**预期 CSV 输出**：

```
三林世博家园,1室1厅,15,合租,2500,月付,,精装,近地铁、采光好、精装,Openclaw,2026,,
```

说明：`decoration`(精装) 同时写入"装修"列和"特色标签"列；`price_type`=合租 推导为"月付"；`warnings` 为空则备注为空。

---

## 环境变量配置

脚本 `feishu-to-csv-preview.js` 通过环境变量读取飞书 Base 标识符，不再硬编码。

### 必填变量

| 变量名 | 说明 | 示例格式 |
|--------|------|----------|
| `FEISHU_BASE_TOKEN` | 飞书多维表格的 Base Token | `<BASE_TOKEN>` |
| `FEISHU_PUBLISH_QUEUE_TABLE_ID` | Publish Queue 表 ID | `<PUBLISH_QUEUE_TABLE_ID>` |
| `FEISHU_PARSED_CANDIDATES_TABLE_ID` | Parsed Candidates 表 ID | `<PARSED_CANDIDATES_TABLE_ID>` |

### 可选变量

| 变量名 | 说明 |
|--------|------|
| `FEISHU_RAW_LEADS_TABLE_ID` | Raw Leads 表 ID（脚本当前未使用，保留供未来扩展） |

### 本地配置方式

在项目根目录 `.env.local` 中添加（该文件已被 `.gitignore` 排除，不会提交到仓库）：

```bash
# 飞书 Base 标识符（从飞书客户端获取）
FEISHU_BASE_TOKEN=your_base_token_here
FEISHU_RAW_LEADS_TABLE_ID=your_raw_leads_table_id_here
FEISHU_PARSED_CANDIDATES_TABLE_ID=your_parsed_candidates_table_id_here
FEISHU_PUBLISH_QUEUE_TABLE_ID=your_publish_queue_table_id_here
```

脚本启动时会自动读取 `.env.local`，缺失必填变量时报错退出。

> **注意**：请勿将真实 token/table ID 提交到 Git 仓库。本仓库为 public，任何硬编码的标识符都会公开可见。

---

## 地理编码门禁

### 什么时候触发

当飞书 Parsed Candidates 中的 `community_name` 在 `data/communities.json` 中**找不到匹配**时，该房源不能直接进入 Publish Queue → CSV 同步链路。必须先解决坐标问题。

### 原因

线上地图依赖 `communities.json` 中的 `coordinates` 字段定位小区。没有坐标的小区在地图上不可见，用户无法找到该房源。

### 处理流程

1. **已有小区**（`communities.json` 中存在且 `coordinates` 非 `[0,0]`）→ 允许发布
2. **新小区 + 高德 geocode 可用**：
   - 调用 `https://restapi.amap.com/v3/geocode/geo` 查询候选坐标
   - 需要 `AMAP_WEB_SERVICE_KEY`（Web 服务 Key，**不是** JSAPI Key）
   - 将候选坐标标记为"待人工确认"
   - 用户确认后才写入 `communities.json`
3. **新小区 + 高德 geocode 不可用**：
   - BLOCKED，要求用户提供小区名/地址/坐标
   - 不写 CSV，不上线

### 高德 Key 说明

- `NEXT_PUBLIC_AMAP_KEY`：**JSAPI Key**，用于网页前端地图渲染，**不能**调用 Web 服务 API
- `AMAP_WEB_SERVICE_KEY`：**Web 服务 Key**，用于服务端地理编码等 REST API
- 两者是不同类型的 Key，需要分别在高德开放平台申请
- Web 服务 Key 仅放在 `.env.local`，不提交到 Git

### 现有脚本

- `scripts/geo/geocode-communities.js`：批量地理编码（需要 Web 服务 Key）
- `scripts/data/add-community.js`：交互式添加新小区（含 geocode）

---

## 相关文档

- 飞书后台方案详情：[docs/feishu-rental-workflow.md](./feishu-rental-workflow.md)
- 数据同步脚本说明：[docs/data-maintenance.md](./data-maintenance.md)
- 测试与发布流程：[docs/ops/testing-and-release.md](./ops/testing-and-release.md)
