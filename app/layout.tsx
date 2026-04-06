import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "公司附近租房地图",
  description: "新同事租房参考，公司附近小区信息一览",
  metadataBase: new URL("https://map.lihuiyang.xyz"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "公司附近租房地图",
    description: "新同事租房参考，公司附近小区信息一览",
    url: "https://map.lihuiyang.xyz",
    siteName: "公司附近租房地图",
    locale: "zh_CN",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "公司附近租房地图",
              url: "https://map.lihuiyang.xyz",
              description: "新同事租房参考，公司附近小区信息一览",
            }),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
