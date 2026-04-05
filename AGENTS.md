<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 项目规则

### 文档同步（强制）

每次代码改动完成后，必须同步更新以下文档：

1. **功能变更**（新增/修改/删除功能）→ 更新 `README.md` 功能概览 + `docs/architecture.md` 对应章节
2. **数据模型变更**（新增/修改接口字段）→ 更新 `docs/architecture.md` + `docs/README.md` 稳定性结论
3. **新文档页面**（新增 .md 文件）→ 更新 `docs/README.md` 索引 + `README.md` 文档导航
4. **配置变更**（环境变量、部署流程）→ 更新 `README.md` 环境变量/部署章节

**检查清单**（每次改动后过一遍）：

- [ ] `README.md` 功能概览是否需要更新？
- [ ] `docs/architecture.md` 是否涉及架构/数据流/组件变更？
- [ ] `docs/README.md` 索引和稳定性结论是否需要更新？
- [ ] 是否有新增文件需要在文档中提及？
