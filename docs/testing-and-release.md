# 测试与发布

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

## 回滚

- Vercel 控制台回滚到上一个生产部署
- 或 `git revert` 后推送 `main` 触发回滚发布
