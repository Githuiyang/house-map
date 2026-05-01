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
- **飞书 Base 已创建**（`租房线索管理`，token 通过 `FEISHU_BASE_TOKEN` 环境变量配置，3 张表 + 示例数据）
- **飞书 Base 已核验**（P1.5 完成，字段与文档完全一致，Link 关系正确，P2 可开始）

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
- [ ] **P2B：飞书 → CSV 实际写入**（脚本可用，当前队列为空）
  - 2026-05-01 完成 P2B-Implementation + P2B.1 + P2B.2 + P2B.3 + P2B.4 + P2B.5：写入 + 预检 + 创建指南 + 审计 + 脱敏 + 最终审计，76 个测试通过
  - P2B.5 最终审计：残留表 ID + Supabase project ref 已清除，0 个真实标识符残留
  - P2B.4 脱敏：31 处真实 token/table ID/URL 已替换为环境变量名
  - P2B-Execution 预检：Publish Queue 为空，未执行 --write
  - **下一步**：本地 commit，push 需用户确认；用户或 Openclaw 产生 `publish_status = "待发布"` 的记录后，重新执行 P2B-Execution
  - 创建记录指南见 `docs/codex-feishu-sync-guide.md` → "如何创建一条可发布记录"
- [ ] **P2C：飞书状态回写 + 完整部署**：回写 publish_status + git commit + push
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
