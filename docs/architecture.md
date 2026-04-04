# 功能与架构

## 数据库层

项目使用 **Supabase PostgreSQL**（东京区域）作为持久化存储，通过 Drizzle ORM 操作。

核心文件：

- `src/db/index.ts`：postgres.js 驱动连接 + Drizzle ORM 初始化
- `src/db/schema.ts`：Drizzle ORM 表定义（使用 `drizzle-orm/pg-core` 方言）
- `drizzle.config.ts`：Drizzle Kit 迁移配置
- `drizzle/`：Drizzle Kit 生成的迁移文件

数据库表：

- `community_comments`：小区评论（ID、小区 ID、昵称、内容、IP 哈希、创建时间）
- `community_images`：小区图片（ID、小区 ID、URL、说明、上传者 IP 哈希、上传时间）

连接方式：

- 驱动：`postgres.js`
- ORM：`drizzle-orm/postgres-js`
- 方言：`pg-core`（PostgreSQL）
- 连接串：`DATABASE_URL` 环境变量
- 主机：Supabase 连接池（`aws-0-ap-northeast-1.pooler.supabase.com:6543`）

常用 Drizzle Kit 命令：

```bash
npx drizzle-kit push      # 推送 schema 到数据库（开发用）
npx drizzle-kit migrate   # 运行迁移（生产推荐）
npx drizzle-kit studio    # 打开 Drizzle Studio 可视化管理
npx drizzle-kit generate  # 生成迁移文件
```

## 页面结构

- `app/page.tsx`：主页面容器，负责筛选状态、列表状态、地图联动状态
- `components/MapView.tsx`：地图主逻辑，负责地图初始化、标记渲染、交互事件、调试面板
- `components/FilterBar.tsx`：筛选 UI
- `components/CommunityCard.tsx`：详情卡片
- `components/ThemeToggle.tsx`：主题切换

## 关键联动关系

- 列表点击 → 更新 `previewCommunity` → 地图弹窗跟随
- 列表 hover → 地图标记高亮
- 地图弹窗点击 → 进入详情卡片
- 选中小区时提高缩放等级，便于确认位置

## 地图核心机制

- 初始中心以公司坐标为准
- 使用 `ResizeObserver + window resize + visualViewport` 触发布局同步
- 通过 `requestAnimationFrame` 轮询容器稳定状态，防止布局切换瞬间坐标抖动
- 点击事件同时保留 AMap 事件与 DOM 兜底链路，便于排查

## 响应式布局要点

- 大屏：左侧筛选栏 + 右侧地图
- 小屏：隐藏侧栏，显示右下角筛选按钮
- 高度链路使用视口约束，避免地图容器被异常撑高
