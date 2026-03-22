import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "公司附近租房地图",
  description: "新同事租房参考，公司附近小区信息一览",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="minimal">
      <body>{children}</body>
    </html>
  );
}
