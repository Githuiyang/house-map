# 公司附近租房地图

> 用高德地图展示「公司坐标 + 3km 推荐圈 + 小区点位」，方便新同事快速筛选租房小区

**线上访问**: https://map.lihuiyang.xyz  
**GitHub**: https://github.com/Githuiyang/house-map

---

## 文档导航（推荐先看）

- 文档总索引：`docs/README.md`
- 快速开始（安装/启动/环境变量）：`docs/quickstart.md`
- 功能与架构（页面结构、地图联动、核心组件）：`docs/architecture.md`
- 坐标与调试（debug 面板、坐标漂移排查、桌面修正）：`docs/debugging.md`
- 数据维护（数据结构、脚本、坐标更新）：`docs/data-maintenance.md`
- 租房向量化系统（Openclaw 入库、向量结构、趋势分析）：`docs/rental-vectorization.md`
- 数据归档规范（命名、备份、存储路径）：`docs/data-archive-policy.md`
- Openclaw 接口指南（输入格式、API、错误处理）：`docs/openclaw-guide.md`
- 测试与发布（CI、E2E、Vercel 部署与回滚）：`docs/testing-and-release.md`

如果你只需要快速上手，请先看 `docs/quickstart.md`；如果你是维护线上稳定性，请直接看 `docs/debugging.md` + `docs/testing-and-release.md`。

---

## 管理员模式

- 管理页面地址：`/admin`
- 租房向量化管理地址：`/admin/rentals`
- 用途：在线编辑每个小区的完整字段（名称、坐标、价格、户型、亮点、注意事项等）
- 支持：
  - 列表检索与逐项编辑
  - 坐标与数值字段直接修改
  - 一键复制完整 JSON
  - 下载编辑后的 JSON 文件
  - 粘贴 JSON 进行整体导入

租房向量化系统支持：

- Openclaw 文本一行一条批量导入
- 自动提取租金、面积、户型、朝向、装修、配套、入住时间等字段
- 输出 dense/sparse/searchable 三类向量结果
- 增量合并、版本号、备份恢复、反馈收集
- 新小区自动调用高德 API 补坐标，并写入 `data/communities.json` 供地图直接展示
- 实时趋势报告与异常检测

说明：

- 自动落图依赖可写文件系统与高德 Web API Key
- 在本地或自托管 Node 环境可直接生效
- 数据库：Supabase PostgreSQL（东京区域），用于小区评论与图片等持久化存储（`src/db/schema.ts`）

建议流程：

1. 在 `/admin` 完成编辑并下载 `communities.admin-edited.json`
2. 用该文件替换 `data/communities.json`
3. 本地运行 `npm run lint && npm run build` 后提交

---

## 功能概览

- 左侧筛选：距离（价格/租法/户型筛选在价格数据上架后自动恢复）
- 小区列表：名称、距离、骑行时间、电梯
- 详情卡片：价格和户型信息待数据补充后显示
- **地图联动**：点击列表项定位并展示小浮窗（显示**单间均价**）⭐；点击地图浮窗进入详情；Hover 列表项高亮地图标记
- 主题切换：明/暗色
- 推荐范围：以公司坐标为圆心的 3km 圆圈
- 调试模式：采样地图中心点与公司坐标偏移（用于排查不同浏览器定位差异）
- 后台管理（`/admin`）：可编辑小区信息
- **单间价格计算**：自动计算并显示单间均价，实习生友好 ⭐
- 租金数据：通过 `data/raw-pricing.json` 分批补充后运行 `npx tsx scripts/process-pricing.ts` 自动上架

## 本地运行

1) 安装依赖

```bash
npm i
```

2) 配置环境变量（见下方）

3) 启动开发服务器

```bash
npm run dev
```

访问：http://localhost:3000

## 环境变量

在项目根目录创建 `.env.local`：

```bash
# 高德地图（客户端可见）
NEXT_PUBLIC_AMAP_KEY=你的高德Key
NEXT_PUBLIC_AMAP_SECURITY_KEY=你的JS安全密钥

# Supabase PostgreSQL（服务端使用，不暴露到客户端）
DATABASE_URL=postgresql://postgres.rcxcmtqihkakhaxezify:[PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require

# 管理员密钥（服务端使用）
ADMIN_KEY=your-admin-key
```

说明：

- `NEXT_PUBLIC_AMAP_KEY`：高德地图 JSAPI Key
- `NEXT_PUBLIC_AMAP_SECURITY_KEY`：配合「JS 安全密钥」使用
- `DATABASE_URL`：Supabase PostgreSQL 连接串（东京区域），用于小区评论与图片等数据存储
- `ADMIN_KEY`：管理员身份验证密钥（服务端使用，不暴露到客户端）。用于 `/admin` 页面登录验证、评论管理、图片上传等管理员操作。通过 URL 参数 `?admin=XXX` 传入，服务端校验后写入 sessionStorage
- 高德 Key 会暴露在浏览器端，请务必在高德控制台配置「域名白名单」

## 数据维护

页面数据源：

- `data/communities.json`：小区列表与坐标（`[lng, lat]`，GCJ-02）
- `data/rental-system/`：租房向量化快照、历史、反馈、报告、备份
- 类型定义：`types/community.ts`（含 `RoomPricing` 合租/整租价格接口）
- 租房类型：`types/rental.ts`

常用脚本（`node scripts/xxx.js`）：

- `scripts/geocode-communities.js`：用高德 Web API 通过小区名补全/更新坐标，会覆盖写回 `data/communities.json`（依赖 `.env.local` 里的 `NEXT_PUBLIC_AMAP_KEY`）
- `scripts/extract-coords.js`：通过高德短链接提取坐标并写回 `data/communities.json`
- `scripts/process-data.js`：一次性数据加工脚本（用法：`node scripts/process-data.js <input.json>`）
- `scripts/release-rental-system.sh`：租房向量化系统上线前检查脚本
- `scripts/process-pricing.ts`：租金数据处理脚本（读取 raw-pricing.json → 去重取平均 → 更新 communities.json）

## 目录结构（当前状态）

```
office-map/
  app/                      Next.js App Router 页面入口
    layout.tsx
    page.tsx                主页面：筛选/列表/地图联动
  components/               UI 组件与地图组件
    MapView.tsx             高德地图加载、标记渲染与联动
    FilterBar.tsx           筛选条
    CommunityCard.tsx       小区详情卡片
    ThemeToggle.tsx         主题切换
  src/db/                   数据库层（Supabase PostgreSQL）
    index.ts                postgres.js 连接 + Drizzle ORM 初始化
    schema.ts               Drizzle ORM 表定义（pg-core）
  data/
    communities.json        当前使用的数据
    communities_raw.json    原始/中间数据（保留参考）
    communities.json.bak    备份
  drizzle/                  Drizzle Kit 生成的迁移文件
  scripts/                  数据处理与坐标辅助脚本
  types/                    TypeScript 类型定义
  public/                   静态资源
```

## 常用命令

```bash
npm run dev          # 本地开发
npm run build        # 构建生产版本
npm run start        # 启动生产服务器
npm run lint         # 代码检查
npm run typecheck    # TypeScript 校验
npm run test:unit    # 单元测试（vitest）
npm run test:unit:coverage  # 单元测试 + 覆盖率门槛
npm run test:integration  # 集成测试（Playwright）
npm run test:e2e     # 端到端测试（Playwright，与集成测试共用）
npm run test:ci      # CI 全量校验（lint/typecheck/build/unit+coverage/e2e）
npm run db:generate  # Drizzle Kit 生成迁移文件
npm run db:migrate   # Drizzle Kit 执行数据库迁移
npm run db:push      # Drizzle Kit 推送 schema 到数据库
npm run db:studio    # Drizzle Kit Studio（可视化管理数据库）
npm run release:rentals  # 租房向量化系统发布前校验
```

## 调试模式（定位偏移排查）

在 URL 加上 `?debug=1` 可开启调试面板，会自动记录地图中心点、公司坐标、偏移距离、容器尺寸等信息，便于对比不同浏览器/不同布局下的差异：

- https://map.lihuiyang.xyz/?debug=1

调试面板支持一键复制 JSON，便于发给维护者做对比分析。

---

## 部署信息

**部署平台**: Vercel
**生产域名**: https://map.lihuiyang.xyz
**Vercel 项目**: `office-map`
**数据库**: Supabase PostgreSQL（东京区域，`aws-1-ap-northeast-1`）

### Vercel 环境变量

在 Vercel 项目中配置（Production/Preview 都需要）：

- `NEXT_PUBLIC_AMAP_KEY`
- `NEXT_PUBLIC_AMAP_SECURITY_KEY`
- `DATABASE_URL`（Supabase PostgreSQL 连接串）
- `ADMIN_KEY`（管理员验证密钥）

同时请在高德控制台把允许的域名加入白名单（至少包含 `map.lihuiyang.xyz`，以及 Vercel 的预览域名）。

### 自动部署

推送到 `main` 分支后，Vercel 会自动部署到生产环境：

```bash
git push origin main
```

---

## 代码审查与发布流程（标准化）

### 1) 代码审查（PR 必需）

审查维度：

- 功能逻辑：关键业务路径、边界条件、异常处理
- 性能：避免无意义重复渲染；事件/观察器无泄漏；地图联动收敛逻辑明确
- 安全：无敏感信息硬编码；第三方 Key 只通过环境变量；域名白名单/配额限制已配置
- 规范：lint/typecheck 通过；命名与目录结构一致
- 可维护性：重复逻辑收敛；副作用集中；避免“补丁套补丁”式修复

仓库内置 PR 模板用于强制检查项：`.github/pull_request_template.md`。

### 2) 自动化测试（审查通过后执行）

本仓库 CI 会在 `pull_request` 与 `main` 上自动执行：

- `npm run lint`
- `npm run build`
- `npm run test:unit:coverage`
- `npm run test:e2e`

说明：

- 单元测试覆盖率有门槛（见 `vitest.config.ts`）
- E2E 测试在 CI 中会禁用真实地图加载（`NEXT_PUBLIC_DISABLE_MAP=1`），避免依赖第三方网络与 Key

### 3) Staging（预发布验证）

定义：**Vercel Preview Deployment** 作为 staging 环境。

流程：

- 提交 PR → Vercel 自动生成 Preview 链接
- 在 Preview 环境做验收：地图加载、默认定位、断点切换（侧栏显示/隐藏）、列表/浮窗/详情交互
- 验收通过后合并到 `main` 触发生产发布

### 4) 生产发布（Production）

发布前检查：

- CI 全绿（lint/build/unit+coverage/e2e）
- Vercel 环境变量（Production）已配置：`NEXT_PUBLIC_AMAP_KEY` / `NEXT_PUBLIC_AMAP_SECURITY_KEY` / `DATABASE_URL` / `ADMIN_KEY`
- 如有数据库 schema 变更，先运行 `npx drizzle-kit push` 或 `npx drizzle-kit migrate` 同步 Supabase（或使用 package.json 快捷命令：`npm run db:generate` / `db:migrate` / `db:push` / `db:studio`）
- 高德控制台域名白名单包含 `map.lihuiyang.xyz`

发布方式：

- 合并到 `main` 后由 Vercel 自动发布（推荐）

### 5) 发布后验证与监控

发布后验证清单（生产域名）：

- 首页可访问、地图可加载
- 默认中心点正确；窗口从窄到宽跨断点后仍正确
- 列表 hover 高亮与点击交互正常

监控建议：

- Vercel Deployments/Logs：构建失败、运行期错误
- 外部探活：定期请求生产首页，检测可用性

### 6) 回滚机制

- Vercel 回滚：在 Vercel 控制台将上一个 Production Deployment Promote/回退
- Git 回滚：`git revert` 合并提交并推送 `main` 触发重新部署

### 手动部署

```bash
# 首次运行需要把本地目录 link 到 Vercel 项目（按提示选择/确认）
npx vercel link

# 部署到生产环境
npx vercel --prod

# 部署到预览环境
npx vercel
```

---

## 相关链接

- **生产网站**: https://map.lihuiyang.xyz
- **GitHub 仓库**: https://github.com/Githuiyang/house-map
- **Vercel 项目**: https://vercel.com/huiyangs-projects/office-map
