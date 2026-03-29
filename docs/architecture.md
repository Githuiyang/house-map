# 功能与架构

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
