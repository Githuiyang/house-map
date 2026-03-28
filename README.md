# 公司附近租房地图

> 用高德地图展示「公司坐标 + 3km 推荐圈 + 小区点位」，方便新同事快速筛选租房小区

**线上访问**: https://map.lihuiyang.xyz  
**GitHub**: https://github.com/Githuiyang/house-map

---

## 功能概览

- 左侧筛选：距离 / 价格区间 / 户型
- 小区列表：名称、距离、骑行时间、价格、电梯、户型
- 地图联动：点击列表项定位并展示详情；Hover 列表项高亮地图标记
- 主题切换：明/暗色
- 推荐范围：以公司坐标为圆心的 3km 圆圈

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

## 环境变量（高德地图）

本项目在客户端加载高德 JSAPI，需要在根目录创建 `.env.local`：

```bash
NEXT_PUBLIC_AMAP_KEY=你的高德Key
NEXT_PUBLIC_AMAP_SECURITY_KEY=你的JS安全密钥
```

说明：

- `NEXT_PUBLIC_AMAP_KEY`：高德地图 JSAPI Key
- `NEXT_PUBLIC_AMAP_SECURITY_KEY`：配合「JS 安全密钥」使用
- Key 会暴露在浏览器端，请务必在高德控制台配置「域名白名单」

## 数据维护

页面数据源：

- `data/communities.json`：小区列表与坐标（`[lng, lat]`，GCJ-02）
- 类型定义：`types/community.ts`

常用脚本（`node scripts/xxx.js`）：

- `scripts/geocode-communities.js`：用高德 Web API 通过小区名补全/更新坐标，会覆盖写回 `data/communities.json`（依赖 `.env.local` 里的 `NEXT_PUBLIC_AMAP_KEY`）
- `scripts/extract-coords.js`：通过高德短链接提取坐标并写回 `data/communities.json`
- `scripts/process-data.js`：一次性数据加工脚本（用法：`node scripts/process-data.js <input.json>`）

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
  data/
    communities.json        当前使用的数据
    communities_raw.json    原始/中间数据（保留参考）
    communities.json.bak    备份
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
```

---

## 部署信息

**部署平台**: Vercel  
**生产域名**: https://map.lihuiyang.xyz  
**Vercel 项目**: `office-map`

### Vercel 环境变量

在 Vercel 项目中配置（Production/Preview 都需要）：

- `NEXT_PUBLIC_AMAP_KEY`
- `NEXT_PUBLIC_AMAP_SECURITY_KEY`

同时请在高德控制台把允许的域名加入白名单（至少包含 `map.lihuiyang.xyz`，以及 Vercel 的预览域名）。

### 自动部署

推送到 `main` 分支后，Vercel 会自动部署到生产环境：

```bash
git push origin main
```

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
