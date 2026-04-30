# 下一步计划（Codex / Agent 读取用）

> 本文档记录已确认的下一步改进项，供 Codex 或其他 Agent 读取后执行。
> 最后更新：2026-04-30

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
- Vercel 环境变量已部分配置（缺少 `DATABASE_URL`、`ADMIN_KEY`）
- 高德地图已恢复（域名白名单已配置，INVALID_USER_DOMAIN 已解决）
- 线上网站：https://map.lihuiyang.xyz

---

## 待处理项

### P0 - 必须处理

- [ ] **补充 Vercel 环境变量**：`DATABASE_URL`（Supabase 连接串）、`ADMIN_KEY`（管理员密钥），否则评论/图片上传等数据库功能无法使用

### P1 - 建议处理

- [ ] **`docs/price-per-room-feature.md` 代码示例过时**：代码示例引用旧版 MapView 逻辑，建议更新
- [ ] **`scripts/data/` 中 JS 脚本统一改为 TS**：当前混用 JS/TS，建议统一用 TS 以获得类型检查
- [ ] **17 个小区 layouts 为空**：数据质量问题，影响户型筛选完整性

### P2 - 可选优化

- [ ] **CI 增加 Markdown 链接检查**：使用 `markdown-link-check` 或类似工具，防止幽灵引用再次出现
- [ ] **`tools/rental-pipeline/` 路径规范**：该目录下的 `admin-rentals/page.tsx` 和 `api-rentals/` 是 Next.js 页面/API 路由的实际实现，但放在 `tools/` 而非 `app/` 下，需要确认是否有意为之
- [ ] **安装 GitHub CLI**：`brew install gh`，配置后可使用 PR 流程

---

## 已知问题

1. **高德地图配额**：使用免费版 Key，有日调用量限制，需定期在 [高德控制台](https://console.amap.com) 检查用量
2. **Supabase 连接串未配置**：数据库相关功能（评论、图片）当前不可用

---

## 执行约定

- 每个 `[ ]` 是一个独立任务，Agent 可以逐个认领
- 完成后在 `[ ]` 中打 `[x]` 并注明完成日期
- P0 项需要用户确认后才能执行（涉及密钥配置）
