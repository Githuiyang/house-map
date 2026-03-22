import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 启用 React Strict Mode 以检测潜在问题
  // MapView 组件使用 isInitializedRef 防止双重初始化
  reactStrictMode: true,
};

export default nextConfig;
