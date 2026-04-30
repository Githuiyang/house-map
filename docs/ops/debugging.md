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

## 数据库连接排查

项目使用 Supabase PostgreSQL（东京区域），通过 `DATABASE_URL` 环境变量连接。

常见问题：

1. **连接超时**
   - 检查 `DATABASE_URL` 是否正确配置
   - 确认 Supabase 项目状态（是否暂停，免费套餐会自动暂停）
   - 检查网络是否能访问 `aws-1-ap-northeast-1.pooler.supabase.com:5432`

2. **Schema 不匹配**
   - 本地运行 `npx drizzle-kit push` 同步 schema
   - 检查 `src/db/schema.ts` 与实际数据库表是否一致
   - 使用 `npx drizzle-kit studio` 可视化检查表结构

3. **SSL 错误**
   - 确保连接串包含 `?sslmode=require`

排查工具：

```bash
# 检查数据库连接（需安装 drizzle-kit）
npx drizzle-kit push --dry-run

# 可视化管理数据库
npx drizzle-kit studio

# 查看 schema 差异
npx drizzle-kit generate
```

---

## 高德地图 INVALID_USER_DOMAIN 排查

> **当前状态**：生产域名 `map.lihuiyang.xyz` 已在高德控制台白名单中配置，线上不再出现此错误。以下内容保留作为排查参考。

### 现象

浏览器控制台出现以下错误：

```
FlyDataAuthTask error: INVALID_USER_DOMAIN
Uncaught Error: Unimplemented type: 3
```

地图区域停留在"地图加载中..."或显示错误面板提示"地图域名未授权"。

### 原因

高德 JSAPI 2.0 要求在控制台为每个 Key 配置**域名白名单**。当页面实际访问域名不在白名单中时，高德服务器会拒绝请求，SDK 抛出 `INVALID_USER_DOMAIN`。

常见触发场景：

1. **新域名上线**：换了部署域名但未更新高德白名单
2. **Vercel Preview 域名**：`xxx.vercel.app` 未加入白名单
3. **本地开发**：`localhost` 未加入白名单（或未添加 `127.0.0.1`）
4. **Key 类型不匹配**：使用了「Web 服务」Key 而非「Web端(JS API)」Key

### 排查步骤

1. **确认 Key 类型**
   - 前往 [高德控制台](https://console.amap.com) → 应用管理 → 我的应用
   - 找到 `NEXT_PUBLIC_AMAP_KEY` 对应的 Key
   - 确认平台类型为「Web端(JS API)」，而非「Web 服务」

2. **检查域名白名单**
   - 在同一个 Key 设置页面找到「域名白名单」
   - 确认包含当前访问域名，例如：
     - `map.lihuiyang.xyz`（生产）
     - `*.vercel.app`（Vercel Preview，如有需要）
     - `localhost`（本地开发）

3. **检查环境变量**
   ```bash
   # 本地 .env.local
   NEXT_PUBLIC_AMAP_KEY=你的Key          # JS API 类型的 Key
   NEXT_PUBLIC_AMAP_SECURITY_KEY=你的安全密钥  # JS 安全密钥（非 Key 本身）
   ```
   - Vercel 中也需要配置相同的环境变量（Production + Preview）

4. **验证 Key 是否有效**
   - 浏览器直接打开：`https://webapi.amap.com/maps?v=2.0&key=你的KEY`
   - 正常应返回 JS 文件，若返回错误 JSON 则 Key 无效

5. **检查 securityJsCode**
   - `NEXT_PUBLIC_AMAP_SECURITY_KEY` 必须是高德控制台中该 Key 对应的「JS 安全密钥」
   - 代码中在 `AMapLoader.load()` 之前通过 `window._AMapSecurityConfig` 设置

### 代码中的错误处理

`components/MapView.tsx` 已实现：

- 加载失败时 `.catch()` 捕获错误
- 检测 `INVALID_USER_DOMAIN` / `INVALID_USER_SCODE` 关键字
- 显示错误面板，包含高德控制台链接和白名单配置指引
- 其他加载错误显示通用错误信息

### 禁用地图（CI 环境）

在 CI 或测试环境中设置 `NEXT_PUBLIC_DISABLE_MAP=1` 可跳过高德地图加载，避免第三方依赖问题。
