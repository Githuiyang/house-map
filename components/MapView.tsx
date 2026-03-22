'use client';

import { useEffect, useRef, useState } from 'react';
import type { Community } from '@/types/community';
import styles from './MapView.module.css';

// 高德地图类型声明
declare global {
  interface Window {
    _AMapSecurityConfig: {
      securityJsCode: string;
    };
    AMap: any;
  }
}

interface MapViewProps {
  communities: Community[];
  selectedCommunity: Community | null;
  onSelectCommunity: (community: Community | null) => void;
}

// 公司坐标：杨浦区淞沪路303号 创智天地 11号楼
const COMPANY_COORDS: [number, number] = [121.5144, 31.2988];
const RECOMMEND_RADIUS = 3000; // 推荐范围3公里（米）

// 计算两点之间的距离（米）- 使用 Haversine 公式
function calculateDistance(coord1: [number, number], coord2: [number, number]): number {
  const R = 6371000; // 地球半径（米）
  const lat1 = (coord1[1] * Math.PI) / 180;
  const lat2 = (coord2[1] * Math.PI) / 180;
  const deltaLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const deltaLon = ((coord2[0] - coord1[0]) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export default function MapView({ communities, onSelectCommunity }: MapViewProps) {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const circleRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const AMapRef = useRef<any>(null);
  const isInitializedRef = useRef(false);
  const isDestroyedRef = useRef(false);
  const legendRef = useRef<HTMLDivElement | null);

  // 初始化地图
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    // 防止 Strict Mode 双重初始化
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    isDestroyedRef.current = false;

    // 动态导入高德地图
    import('@amap/amap-jsapi-loader').then((AMapLoader) => {
      // 检查是否已被销毁
      if (isDestroyedRef.current) return;

      // 安全配置
      // 注意: API Key 会暴露在客户端代码中
      // 请确保在高德地图控制台设置域名白名单限制
      window._AMapSecurityConfig = {
        securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECURITY_KEY || '',
      };

      AMapLoader.default.load({
        key: process.env.NEXT_PUBLIC_AMAP_KEY || '',
        version: '2.0',
        plugins: ['AMap.Scale'],
      }).then((AMap: any) => {
        // 检查是否已被销毁
        if (isDestroyedRef.current || !containerRef.current) return;

        AMapRef.current = AMap;

        const map = new AMap.Map(containerRef.current, {
          zoom: 13, // zoom=13 显示约4-5km 范围
          center: COMPANY_COORDS,
        });

        // 添加3公里推荐范围圆圈（淡色虚线)
        const circle = new AMap.Circle({
          center: COMPANY_COORDS,
          radius: RECOMMEND_RADIUS,
          strokeColor: '#888888',
          strokeWeight: 1,
          strokeOpacity: 0.5,
          strokeStyle: 'dashed',
          fillColor: '#4CAF50',
          fillOpacity: 0.05,
        });
        circle.setMap(map);
        circleRef.current = circle;

        // 添加公司标记
        const companyMarker = new AMap.Marker({
          position: COMPANY_COORDS,
          title: '公司',
          content: `<div class="${styles.companyMarker}">🏢</div>`,
          offset: new AMap.Pixel(-15, -15),
        });
        companyMarker.setMap(map);

        // 添加图例
        const legendDiv = document.createElement('div');
        legendDiv.className = styles.legend;
        legendDiv.innerHTML = `
          <div class="${styles.legendItem} ${styles.legendDot} ${styles.recommendedMarker}"></div>
          <span>🟢 推荐 (3km内)</span>
        `;
        map.getContainer().appendChild(legendDiv);
        legendRef.current = legendDiv;

        // 添加缩放控件
        map.addControl(new AMap.Scale());

        mapRef.current = map;
        setMapReady(true);
      }).catch((e: Error) => {
        console.error('地图加载失败:', e);
      });
    });

    return () => {
      isDestroyedRef.current = true;
      if (legendRef.current) {
        legendRef.current.remove();
      }
      if (mapRef.current) {
        try {
          mapRef.current.destroy();
        } catch (e) {
          console.warn('地图销毁时出错:', e);
        }
        mapRef.current = null;
      }
      isInitializedRef.current = false;
      setMapReady(false);
    };
  }, []);

  // 添加小区标记
  useEffect(() => {
    if (!mapRef.current || !mapReady || !AMapRef.current) return;

    // 清除旧标记
    markersRef.current.forEach(marker => {
      try {
        marker.setMap(null);
      } catch {
        // 忽略已销毁的标记
      }
    });
    markersRef.current = [];

    // 添加新标记 - 统一使用绿色圆点，不区分是否推荐
    communities.forEach(community => {
      const distance = calculateDistance(community.coordinates, COMPANY_COORDS);
      const isRecommended = distance <= RECOMMEND_RADIUS;


      const marker = new AMapRef.current.Marker({
        position: community.coordinates,
        title: community.name,
        content: `<div class="${styles.communityMarker}" style="background: ${isRecommended ? '#4CAF50' : '#ccc'}"></div>`,
        offset: new AMapRef.current.Pixel(-10, -10),
      });

      marker.on('click', () => {
        onSelectCommunity(community);
      });
      marker.setMap(mapRef.current);
      markersRef.current.push(marker);
    });
  }, [communities, mapReady, onSelectCommunity]);

  return (
    <div ref={containerRef} className={styles.container}>
      {!mapReady && <div className={styles.loading}>地图加载中...</div>}
    </div>
  );
}
