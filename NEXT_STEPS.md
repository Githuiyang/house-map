# 下一步计划（Codex / Agent 读取用）

> 本文档记录已确认的下一步改进项，供 Codex 或其他 Agent 读取后执行。
> 最后更新：2026-05-01

---

## 当前状态

- 目录结构整理已完成（详见 git log）
- TypeScript / ESLint：0 errors, 0 warnings
- E2E smoke 测试已修正（4 个用例通过）
- 文档数据口径已更新（53 个小区 / 36 含 roomPricing / 13 含 pricePerRoomStats）
- 文档旧脚本路径已全部修正
- 所有坐标缺失已补全（无坐标缺失）
- lint warnings 已清零（0 errors, 0 warnings）
- `data/communities_raw.json` 已 `git rm`
- `scripts/data/sync-data 2.sh` 旧副本已删除
- Vercel 环境变量：`NEXT_PUBLIC_AMAP_KEY` + `NEXT_PUBLIC_AMAP_SECURITY_KEY` 已配置；`DATABASE_URL` + `ADMIN_KEY` 需用户最终确认
- 高德地图已恢复（域名白名单已配置，INVALID_USER_DOMAIN 已解决）
- 线上网站：https://map.lihuiyang.xyz
- **飞书租房后台方案已入库**（`docs/feishu-rental-workflow.md`），取代 Supabase 直连方案
- **飞书 Base 已重建**（`租房线索管理`，2026-05-01，3 张表 + 完整字段 + 110 条历史数据已导入 Parsed Candidates）
- 飞书 Base 访问方式：飞书客户端 / 本地私有记录（用户已获 full_access 权限）
- `.env.local` 已配置 `FEISHU_BASE_TOKEN` + 3 个 `TABLE_ID`

---

## 待处理项

### P2 - 飞书同步（分阶段）

- [x] **P2A：飞书 Publish Queue → CSV dry-run 预览**（2026-04-30 完成）
  - 脚本：`scripts/data/feishu-to-csv-preview.js`
  - 测试：`scripts/data/feishu-to-csv-preview.test.ts`（Vitest，52 个测试）
  - 功能：读取待发布记录 → 获取候选字段 → 映射 CSV 行 → 预览输出
- [x] **P2A.1：dry-run 脚本可靠性收口**（2026-04-30 完成）
  - 测试改为 Vitest `describe/it/expect` 风格，纳入 `npm run test:unit`
  - 修复 record-get 解析：发现 record-get 返回命名对象（非数组），`parseRecordGetResult` 已修正
  - 增强 `callLarkCli` 错误输出：解析 JSON 错误、keychain 提示
  - 文档口径统一：`highlights`/`warnings` 改为"中文顿号分隔"
- [x] **P2B：飞书 → CSV 实际写入**（已完成，已推送，线上正常）
  - 2026-05-01 完成 P2B.1~P2B.7：写入 + 预检 + 创建指南 + 审计 + 脱敏 + 最终审计 + 推送部署，76 个测试通过
  - P2B.7 推送：2 个 commit 已推送到 origin/main，Vercel 自动部署成功，线上 200 OK
  - P2B.4-P2B.5 脱敏：所有真实标识符已清除，环境变量化完成
  - P2B-Execution 预检：Publish Queue 为空，未执行 --write
  - **下一步**：用户或 Openclaw 产生 `publish_status = "待发布"` 的记录后，执行 P2B-Execution
  - 创建记录指南见 `docs/codex-feishu-sync-guide.md` → "如何创建一条可发布记录"
- [ ] **P2C：飞书状态回写 + 完整部署**：回写 publish_status + git commit + push
  - [x] **P2C.0.1**：最终审计 + 推送（2026-05-01 完成）
  - [x] **P2C.1**：dry-run 端到端测试（2026-05-01 完成）
    - 修复：`feishu-to-csv-preview.js` 添加 `--format json`（lark-cli 默认输出 markdown）
    - 新建测试链路：Raw Leads → Parsed Candidates → Publish Queue（各 1 条，北郊小区）
    - dry-run 成功：1 条可写入，0 条 BLOCKED，禁止字段检查 PASS
    - CSV/JSON 未变更，未执行 --write
  - [x] **P2C.2**：--write 实际写入测试 → 成功并已回滚（2026-05-01）
    - [x] P2C.2 执行：--write 成功，CSV 追加 1 行北郊小区测试记录
    - [x] P2C.2R 回滚：CSV 测试行已删除，飞书测试记录改为"已过期"，数据恢复原状
    - 端到端链路验证通过，测试数据不影响正式网站
  - [ ] **P2C.3**：真实房源上线（需先解决坐标门禁）
    - [x] **P2C.3A-GEO**：地理编码门禁 + 真实房源识别（2026-05-01）
      - 发现真实房源：盛世豪园1期（Raw Leads RL-0002，两房两厅 ¥16800）
      - 坐标门禁 BLOCKED：新小区不在 communities.json 中，AMAP_WEB_SERVICE_KEY 未配置
      - 旧测试数据已清理（Raw Leads/Parsed Candidates→已忽略，Publish Queue→发布失败）
      - 文档更新：codex-feishu-sync-guide.md 新增地理编码门禁章节，feishu-rental-workflow.md 加入门禁流程
    - [ ] **P2C.3B**：用户确认坐标后 → sync-csv + 回写飞书 + commit + push 上线
      - [x] P2C.3B 执行完成（2026-05-01）：盛世豪园1期已上线
        - 高德 geocode 确认坐标 121.517493, 31.318160（住宅区，杨浦区）
        - communities.json 53→54 社区
        - CSV +1 行，sync-csv 1 个更新
        - 飞书回写已发布
        - 新增 AMAP_WEB_SERVICE_KEY 到 .env.local
    - **P2C 飞书同步管线已完整验证并上线**
  - [x] **P2C.4**：上线后验收（2026-05-01）
    - 本地/飞书/线上全链路验收通过，盛世豪园1期可见
    - 防重复发布：已有飞书状态过滤保护，但缺少 --write 后原子回写 + CSV 层去重
  - [x] **P2C.5**：防重复发布机制（--write 后原子回写飞书状态 + CSV 去重）（2026-05-01 完成）
    - 新增 `buildCsvDuplicateKey()` / `loadExistingCsvKeys()` / `findDuplicateCandidates()` 三个去重函数
    - CSV 层去重：追加前检查社区+户型+面积+价格+价格类型+来源+年份，重复行标记 BLOCKED_DUPLICATE
    - 队列内去重：同一 candidate 被多条 PQ 关联时标记 BLOCKED_DUPLICATE_QUEUE
    - `--mark-published` 参数：配合 `--write` 使用，CSV 追加成功后自动回写飞书 `publish_status=已发布`
    - 新增 13 个单元测试（总计 89 tests / 4 files）
    - 文档更新：codex-feishu-sync-guide.md + feishu-rental-workflow.md
  - 等待下一条真实飞书待发布记录进入后继续
- [x] **UI-1 修复 map 标记 hover 闪烁** (2026-05-01)
  - 根因：CSS `transform: scale()` 改变命中区域触发 mouseover/mouseout 循环；tooltip 重建拦截事件；setState 未去重
  - 修复：移除所有 transform 动画，改用 outline/box-shadow/filter；tooltip 添加 pointer-events:none + 80ms 延迟移除；React setState 增加幂等守卫
  - 涉及文件：MapView.module.css、MapView.tsx、page.tsx、page.module.css
  - 验证：lint 0 errors、typecheck OK、89 tests pass、build OK、dry-run OK
- [x] **UI-1.2 地图 hover 命中区域抖动根治** (2026-05-01)
  - 根因：AMap marker.on('mouseover'/'mouseout') 在内部子元素切换时触发；mouseout ≠ mouseleave
  - 修复：改为 `.communityLabel` DOM 元素上的 `pointerenter`/`pointerleave`；提取 `bindCommunityHover()` 统一处理；移除 CSS `filter`；hide timer 取消机制
  - 涉及文件：MapView.tsx、MapView.module.css
  - 验证：lint 0 errors、typecheck OK、89 tests pass、build OK
- [x] **UI-1.3 hover 阻挡 click + 轻微移动闪烁根治** (2026-05-01)
  - 根因：AMap.Marker tooltip 外层容器 div 接收 pointer events（即使内层 pointer-events:none），z-index=9999 覆盖社区标记 z-index=100 → 物理阻挡点击
  - 修复：完全移除 AMap.Marker tooltip，改用 React DOM tooltip（state + JSX + `lngLatToContainer` 定位）；tooltip div `pointerEvents:'none'` 真正不拦截事件
  - 涉及文件：MapView.tsx
  - 验证：lint 0 errors、typecheck OK、89 tests pass、build OK、dev server HTTP 200
- [x] **UI-2A 详情卡片信息模型重构** (2026-05-01)
  - 新增 `utils/communityCardViewModel.ts`：纯函数 `buildCommunityCardViewModel(Community) → ViewModel`
  - 发现所有 54 个小区 shared=0，移除合租/整租切换
  - highlights 分类为 pros / notes（来源/有钥匙/看房方便等归入备注）
  - 一室 pricePerRoom 归入整租（一居整租），多室才展示单间估算
  - priceSummary 改为 priceBadges：整租/单间估算各自带标签+单位
  - 新增 noPriceRows 展示区（已知户型暂无报价）
  - 新增数据提示区（缺价格/缺户型/缺面积/数据过时）
  - 表头改为：户型 / 面积 / 整租 / 单间估算
  - 新增 27 个单元测试（总计 116 tests）
  - 验证：lint 0 errors/warnings、typecheck OK、116 tests、build OK
- [ ] **UI-2B 详情卡片视觉美化**：基于 UI-2A viewModel 做视觉优化（间距、颜色、动画等）
- [ ] **`docs/price-per-room-feature.md` 代码示例过时**：代码示例引用旧版 MapView 逻辑，建议更新
- [ ] **`scripts/data/` 中 JS 脚本统一改为 TS**：当前混用 JS/TS，建议统一用 TS 以获得类型检查
- [ ] **17 个小区 layouts 为空**：数据质量问题，影响户型筛选完整性

### P3 - 可选优化

- [ ] **CI 增加 Markdown 链接检查**：使用 `markdown-link-check` 或类似工具，防止幽灵引用再次出现
- [ ] **`tools/rental-pipeline/` 归档**：飞书方案已取代 Supabase 直连方案，`tools/` 中的原型代码可归档或删除
- [ ] **安装 GitHub CLI**：`brew install gh`，配置后可使用 PR 流程

---

## 已知问题

1. **高德地图配额**：使用免费版 Key，有日调用量限制，需定期在 [高德控制台](https://console.amap.com) 检查用量

---

## 执行约定

- 每个 `[ ]` 是一个独立任务，Agent 可以逐个认领
- 完成后在 `[ ]` 中打 `[x]` 并注明完成日期
- P1 项需要用户确认后才能执行（涉及飞书 Base 创建）
