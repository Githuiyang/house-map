# 租房向量化处理系统

## 目标

将 Openclaw 持续输入的租房自然语言描述，转换为可校验、可检索、可分析的结构化记录，并生成趋势分析结果。

## 处理链路

1. 输入接入：`POST /api/rentals/ingest`
2. 字段抽取：`utils/rentalProcessing.ts`
3. 数据校验：`validateRentalParsed`
4. 向量构建：`buildRentalVector`
5. 增量入库：`utils/rentalStorage.ts`
6. 小区同步：`utils/communityCatalog.ts`
7. 趋势报告：`POST /api/rentals/report`
8. 管理界面：`/admin/rentals`

## 数据模型

核心类型定义位于 `types/rental.ts`：

- `RentalIngestInput`：Openclaw 输入对象
- `RentalParsedFields`：结构化抽取结果
- `RentalVectorDocument`：密集向量 + 稀疏特征 + 搜索文本
- `RentalListingRecord`：标准化房源记录
- `RentalCommunitySnapshot`：按小区聚合后的当前视图
- `RentalTrendReport`：趋势分析报告

## 向量化策略

### Dense Vector

固定长度数值向量，适合后续做相似度检索或聚类：

- 租金
- 面积
- 单价（租金 / 面积）
- 室数 / 厅数 / 卫数
- 朝向数量
- 是否可谈
- 是否有钥匙
- 是否含车位
- 是否电梯

### Sparse Vector

离散特征映射，适合规则召回与过滤：

- `kw:小区名`
- `kw:装修标准`
- `kw:朝向`
- `kw:设施`
- `flag:negotiable`
- `flag:hasKey`
- `layout:二室一厅`

### Searchable Text

把原始描述与关键词合并为统一检索文本，用于全文召回或后续接入 embedding 服务。

## 增量更新逻辑

- 使用 `communityId + price + area + layout + orientation + availableFrom` 构建 `dedupeKey`
- 如果命中相同 `dedupeKey`：
  - 增加 `seenCount`
  - 更新时间戳
  - 合并设施、标签、位置提示
  - 版本号 `version + 1`
- 如果未命中：
  - 作为新房源写入
  - 刷新小区聚合快照

## 新小区自动落图

- ingest 完成后，系统会检查 `data/communities.json` 中是否已存在对应小区
- 如果不存在，会调用高德 Web API 进行地理编码
- 成功后自动创建新的小区记录，并写入地图数据源
- 同时自动计算与公司的距离、骑行/步行时间、默认价格区间、户型与亮点
- 如果地理编码失败，则不会强行写入地图，而是返回 `skipped`，等待人工补点

## 备份与恢复

- 每次 ingest 前自动备份当前快照到 `data/rental-system/backups/`
- `POST /api/rentals/restore` 可恢复最近一次备份
- 历史操作写入 `data/rental-system/history-events.json`

## 趋势分析

`utils/rentalAnalysis.ts` 输出以下指标：

- 小区租金均价
- 租金变化率
- 活跃度评分
- 供需压力评分
- 议价比例
- 数据新鲜度
- 异常项（缺字段、重复、价格异常）

## 管理员使用流程

1. 打开 `/admin/rentals`
2. 粘贴 Openclaw 文本，一行一条
3. 点击“批量处理”
4. 检查抽取结果与异常列表
5. 点击“生成报告”刷新分析结果
6. 如需回滚，点击“恢复最近备份”
7. 如发现解析问题，在页面底部提交反馈
