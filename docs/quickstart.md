# 快速开始

## 1) 环境要求

- Node.js 20+
- npm 10+

## 2) 安装依赖

```bash
npm i
```

## 3) 配置环境变量

在项目根目录新建 `.env.local`：

```bash
# 高德地图（客户端可见）
NEXT_PUBLIC_AMAP_KEY=你的高德Key
NEXT_PUBLIC_AMAP_SECURITY_KEY=你的JS安全密钥

# Supabase PostgreSQL（服务端使用，不暴露到客户端）
DATABASE_URL=postgresql://postgres.rcxcmtqihkakhaxezify:[PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require

# 管理员密钥（服务端使用）
ADMIN_KEY=your-admin-key
```

注意：

- 高德 Key 变量在客户端可见，务必配置高德域名白名单
- `DATABASE_URL` 为 Supabase PostgreSQL 连接串（东京区域），仅服务端使用
- 本地调试和 Vercel 预览/生产都需要配置
- 数据库 schema 变更后需运行 `npx drizzle-kit push` 同步

## 4) 本地开发

```bash
npm run dev
```

打开 `http://localhost:3000`

## 5) 常用命令

```bash
npm run lint
npm run build
npm run test:unit
npm run test:unit:coverage
npm run test:e2e
```

## 6) 线上地址

- 生产站点：https://map.lihuiyang.xyz
- 仓库地址：https://github.com/Githuiyang/house-map
