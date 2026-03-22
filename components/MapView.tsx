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

export default function MapView({ communities, onSelectCommunity }: MapViewProps) {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const AMapRef = useRef<any>(null);
  const isInitializedRef = useRef(false);
  const isDestroyedRef = useRef(false);

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
          zoom: 14,
          center: COMPANY_COORDS,
          // 不使用自定义样式，避免样式加载问题
        });

        // 添加公司标记
        const companyMarker = new AMap.Marker({
          position: COMPANY_COORDS,
          title: '公司',
          content: `<div class="${styles.companyMarker}">🏢</div>`,
        });
        map.add(companyMarker);

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

    // 添加新标记
    communities.forEach(community => {
      const marker = new AMapRef.current.Marker({
        position: community.coordinates,
        title: community.name,
        content: `<div class="${styles.communityMarker}" data-id="${community.id}">🏠</div>`,
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
