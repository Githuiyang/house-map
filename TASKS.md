# 小区列表优化

> **状态: 已完成**
> **完成日期: 2026-04-04**
> **完成说明**: 列表项已展示名称+距离/骑行+价格/电梯/户型三行布局；Hover 联动高亮已生效（hoveredCommunity 状态传递给 MapView）；点击列表项定位功能正常保留。

## 需求

左侧小区列表优化，让用户不用看地图也能做初步筛选决策。

## 改动点

### 1. 列表项信息重新组织

**现状**：
```
江湾翰林
1.2km · 4000-6000元
```

**目标**：
```
🏠 江湾翰林
1.2km · 骑行6分钟
4-6k · 有电梯 · 一室/两室
```

**字段映射**：
- `community.distance` → "X km"
- `community.bikeTime` → "骑行 X 分钟"
- `community.price.min/max` → "X-Yk" (简化单位)
- `community.elevator` → "有电梯" / "无电梯" / ""
- `community.layouts` → 取前2个户型，用 `/` 分隔

### 2. Hover 联动高亮

- 鼠标 hover 列表项时，地图上对应的小区标记放大/高亮
- 需要在 MapView 组件添加 `hoveredCommunity` prop
- 样式：scale(1.2) + 更深的阴影

### 3. 文件修改

- `app/page.tsx` - 添加 `hoveredCommunity` 状态，传递给列表和地图
- `app/page.module.css` - 调整 `.listItem` 样式（两行布局）
- `components/MapView.tsx` - 接收 `hoveredCommunity` prop，更新标记样式
- `components/MapView.module.css` - 添加 hover 高亮样式

## 验收标准

1. 列表项显示：名称 + 距离/骑行 + 价格/电梯/户型
2. Hover 列表项时，地图标记有明显高亮反馈
3. 点击列表项，地图定位到对应小区（已有功能，确保不破坏）

---

完成后运行: `openclaw system event --text "Done: 小区列表优化完成" --mode now`
