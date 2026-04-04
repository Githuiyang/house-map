# 测试与发布

## 数据库变更检查

如果本次发布涉及数据库 schema 变更（`src/db/schema.ts` 修改）：

1. 生成迁移文件：`npx drizzle-kit generate`
2. 本地验证迁移：`npx drizzle-kit push`
3. 确认 `drizzle/` 目录下生成了正确的迁移 SQL
4. 生产发布前执行：`npx drizzle-kit migrate`

## 本地发布前检查

```bash
npm run lint
npm run build
npm run test:unit:coverage
```

如需 E2E：

```bash
npx playwright install
npm run test:e2e
```

## CI 流程

触发条件：

- push 到 `main`
- 对 `main` 发起 PR

执行内容：

- lint
- build
- unit coverage
- e2e

## Vercel 发布

主分支自动发布到生产：

```bash
git push origin main
```

手动发布：

```bash
npx vercel --prod
```

## 发布后验收

- 首页可访问
- 默认中心正确
- 断点切换（侧栏显隐）后坐标不漂移
- 列表/地图/详情联动正常
- 数据库连接正常（评论/图片功能可用）

## 回滚

- Vercel 控制台回滚到上一个生产部署
- 或 `git revert` 后推送 `main` 触发回滚发布
- 注意：数据库迁移不支持自动回滚，如需回滚 schema 变更需手动编写反向 SQL
