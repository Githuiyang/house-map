# 坐标与调试指南

## 调试模式开启

- URL 加 `?debug=1`
- 或 `localStorage.office-map-debug=1` 后刷新

## 面板里最关键的字段

- `center`：地图当前中心点
- `company`：公司坐标
- `distanceMeters`：中心与公司的偏移距离
- `containerRect`：地图容器在页面中的尺寸和位置
- `pointer` / `amapClick`：点击链路信息
- `hitTest`：实际命中的 DOM 元素

## 常见异常与判断

1. `distanceMeters` 很大但 `center` 不变  
   表示中心逻辑偏移，检查桌面修正参数。

2. `container.h` 异常大（例如几千）  
   表示页面高度链路异常，优先查布局容器是否被内容撑开。

3. `hitTest.inMap = false`  
   表示点击被覆盖层吃掉，不是地图坐标转换问题。

4. 只有 `dom:click` 没有 `amap:click`  
   可能是地图层事件在某些状态未触发，先看 DOM 兜底数据。

## 桌面修正策略

- 默认以公司居中为目标
- 桌面端支持“基线 / 关闭 / 微调方向 / 快速对齐”
- 微调后会持久化到 localStorage，刷新不丢失

## 推荐排查流程

1. 刷新页面后立即复制一份 debug JSON
2. 在 768px 附近反复拖动窗口并再次复制
3. 对比 `containerRect`、`distanceMeters`、`label` 序列
4. 若仅桌面偏移，使用桌面修正微调并固化
