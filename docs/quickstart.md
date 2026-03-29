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
NEXT_PUBLIC_AMAP_KEY=你的高德Key
NEXT_PUBLIC_AMAP_SECURITY_KEY=你的JS安全密钥
```

注意：

- 这两个变量都在客户端可见，务必配置高德域名白名单
- 本地调试和 Vercel 预览/生产都需要配置

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
