'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Community } from '@/types/community';
import { calculateDistanceMeters, normalizeLngLat } from '@/utils/geo';
import { COMPANY_COORDS } from '@/utils/constants';
import { formatK, formatPricePerRoom } from '@/utils/price';
import styles from './MapView.module.css';

// 高德地图类型声明
declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode: string;
    };
    AMap?: unknown;
  }
}

type AMapLngLat = { lng: number; lat: number };
type AMapPixel = unknown;

type AMapMap = {
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  addControl: (control: unknown) => void;
  getContainer: () => HTMLElement;
  getCenter?: () => unknown;
  getZoom?: () => number;
  containerToLngLat?: (pixel: AMapPixel) => unknown;
  pixelToLngLat?: (pixel: AMapPixel) => unknown;
  on?: (event: string, handler: (e?: unknown) => void) => void;
  resize?: () => void;
  destroy: () => void;
};

type AMapCircle = {
  setMap: (map: AMapMap | null) => void;
  setCenter: (center: [number, number]) => void;
};

type AMapMarker = {
  setMap: (map: AMapMap | null) => void;
  on: (event: string, handler: (e: unknown) => void) => void;
  setDraggable: (draggable: boolean) => void;
  setPosition: (position: [number, number]) => void;
  setContent: (html: string) => void;
  setzIndex: (zIndex: number) => void;
  getPosition: () => AMapLngLat;
};

type AMapApi = {
  Map: new (container: HTMLElement, opts: { zoom: number; center: [number, number] }) => AMapMap;
  Marker: new (opts: {
    position: [number, number];
    title?: string;
    content?: string;
    offset?: AMapPixel;
    draggable?: boolean;
    zIndex?: number;
  }) => AMapMarker;
  Circle: new (opts: {
    center: [number, number];
    radius: number;
    strokeColor: string;
    strokeWeight: number;
    strokeOpacity: number;
    strokeStyle: string;
    fillColor: string;
    fillOpacity: number;
  }) => AMapCircle;
  plugin?: (plugins: string | string[], cb: () => void) => void;
  Pixel: new (x: number, y: number) => AMapPixel;
  Scale: new () => unknown;
};

type AMapLoaderModule = {
  default: {
    load: (opts: { key: string; version: string; plugins: string[] }) => Promise<AMapApi>;
  };
};

type AMapEventWithTarget = {
  target: {
    getPosition: () => AMapLngLat;
    setContent?: (html: string) => void;
  };
};

interface MapViewProps {
  communities: Community[];
  selectedCommunity: Community | null;
  previewCommunity: Community | null;
  hoveredCommunity: Community | null;
  onSelectCommunity: (community: Community | null) => void;
  onPreviewCommunity: (community: Community | null) => void;
}

const RECOMMEND_RADIUS = 3000; // 推荐范围3公里（米）
const DEFAULT_ZOOM = 16;

export default function MapView({ communities, selectedCommunity, previewCommunity, hoveredCommunity, onSelectCommunity, onPreviewCommunity }: MapViewProps) {
  const mapRef = useRef<AMapMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, AMapMarker>>(new Map());
  const circleRef = useRef<AMapCircle | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<{ type: 'domain' | 'generic'; message: string } | null>(null);
  const mapDisabled = process.env.NEXT_PUBLIC_DISABLE_MAP === '1';
  const AMapRef = useRef<AMapApi | null>(null);
  const isInitializedRef = useRef(false);
  const isDestroyedRef = useRef(false);
  const legendRef = useRef<HTMLDivElement | null>(null);
  const previewPopupMarkerRef = useRef<AMapMarker | null>(null);
  const previewCommunityRef = useRef<Community | null>(null);
  const clusterRef = useRef<unknown>(null);
  const tooltipMarkersRef = useRef<Map<string, AMapMarker>>(new Map());
  const layoutSyncRafRef = useRef<number | null>(null);
  const layoutSyncStateRef = useRef<{ start: number; lastW: number; lastH: number; lastLeft: number; lastTop: number; stable: number; reason: string } | null>(null);

  // Keep previewCommunityRef in sync with prop
  useEffect(() => {
    previewCommunityRef.current = previewCommunity;
  }, [previewCommunity]);

  const extractLngLat = useCallback((value: unknown): [number, number] | null => {
    if (!value) return null;
    if (Array.isArray(value) && value.length >= 2) {
      const lng = Number(value[0]);
      const lat = Number(value[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
      return null;
    }
    const v = value as { lng?: unknown; lat?: unknown; getLng?: () => unknown; getLat?: () => unknown };
    const lngMaybe = typeof v.getLng === 'function' ? v.getLng() : v.lng;
    const latMaybe = typeof v.getLat === 'function' ? v.getLat() : v.lat;
    const lng = Number(lngMaybe);
    const lat = Number(latMaybe);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
  }, []);

  const getDesiredCenter = useCallback((): [number, number] => {
    if (selectedCommunity) {
      const coords = normalizeLngLat(selectedCommunity.coordinates);
      if (coords) return coords;
    }
    if (previewCommunity) {
      const coords = normalizeLngLat(previewCommunity.coordinates);
      if (coords) return coords;
    }
    return normalizeLngLat(COMPANY_COORDS) ?? COMPANY_COORDS;
  }, [previewCommunity, selectedCommunity]);

  const getDesiredZoom = useCallback(() => {
    return DEFAULT_ZOOM;
  }, []);

  const applyDesiredViewport = useCallback((label: string) => {
    const map = mapRef.current;
    if (!map) return;

    map.resize?.();
    const baseReason = label.split(':')[0] ?? '';
    const shouldApplyDesiredCenter = baseReason === 'viewportChange' || baseReason === 'mapReady' || baseReason === 'complete' || baseReason === 'created';
    if (shouldApplyDesiredCenter) {
      map.setZoom(getDesiredZoom());
      map.setCenter(getDesiredCenter());
    }
  }, [getDesiredCenter, getDesiredZoom]);

  const applyDesiredViewportRef = useRef<(label: string) => void>(() => {});
  useEffect(() => {
    applyDesiredViewportRef.current = applyDesiredViewport;
  }, [applyDesiredViewport]);

  const scheduleViewportSync = useCallback((reason: string) => {
    const existing = layoutSyncStateRef.current;
    if (existing) {
      existing.reason = reason;
      existing.stable = 0;
      existing.start = performance.now();
      return;
    }

    layoutSyncStateRef.current = { start: performance.now(), lastW: -1, lastH: -1, lastLeft: -1, lastTop: -1, stable: 0, reason };

    const step = () => {
      const map = mapRef.current;
      const el = containerRef.current;
      const state = layoutSyncStateRef.current;
      if (!map || !el || !state) {
        layoutSyncRafRef.current = null;
        layoutSyncStateRef.current = null;
        return;
      }

      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      const left = Math.round(rect.left);
      const top = Math.round(rect.top);
      const changed = w !== state.lastW || h !== state.lastH || left !== state.lastLeft || top !== state.lastTop;
      if (changed) {
        state.lastW = w;
        state.lastH = h;
        state.lastLeft = left;
        state.lastTop = top;
        state.stable = 0;
      } else {
        state.stable += 1;
      }

      applyDesiredViewportRef.current(`${state.reason}:${w}x${h}@${left},${top}:stable${state.stable}`);

      const elapsed = performance.now() - state.start;
      if (state.stable >= 2 || elapsed >= 900) {
        layoutSyncRafRef.current = null;
        layoutSyncStateRef.current = null;
        return;
      }

      layoutSyncRafRef.current = requestAnimationFrame(step);
    };

    layoutSyncRafRef.current = requestAnimationFrame(step);
  }, []);

  const scheduleViewportSyncRef = useRef<(reason: string) => void>(() => {});
  useEffect(() => {
    scheduleViewportSyncRef.current = scheduleViewportSync;
  }, [scheduleViewportSync]);

  // 初始化地图
  useEffect(() => {
    if (mapDisabled) return;
    if (typeof window === 'undefined' || !containerRef.current) return;

    // 防止 Strict Mode 双重初始化
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    isDestroyedRef.current = false;

    // 动态导入高德地图
    import('@amap/amap-jsapi-loader').then((AMapLoader: AMapLoaderModule) => {
      // 检查是否已被销毁
      if (isDestroyedRef.current) return;

      // 安全配置
      window._AMapSecurityConfig = {
        securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECURITY_KEY || '',
      };

      AMapLoader.default.load({
        key: process.env.NEXT_PUBLIC_AMAP_KEY || '',
        version: '2.0',
        plugins: ['AMap.Scale', 'AMap.MarkerCluster'],
      }).then((AMap: AMapApi) => {
        // 检查是否已被销毁
        if (isDestroyedRef.current || !containerRef.current) return;

        AMapRef.current = AMap;

        const initialCompanyCoords = normalizeLngLat(COMPANY_COORDS) ?? COMPANY_COORDS;

        const map = new AMap.Map(containerRef.current, {
          zoom: DEFAULT_ZOOM,
          center: initialCompanyCoords,
        });

        map.on?.('complete', () => {
          if (isDestroyedRef.current) return;
          scheduleViewportSyncRef.current('complete');
          requestAnimationFrame(() => {
            if (isDestroyedRef.current) return;
          });
        });

        // 添加3公里推荐范围圆圈（淡色虚线)
        const circle = new AMap.Circle({
          center: initialCompanyCoords,
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
          position: initialCompanyCoords,
          title: '公司',
          content: `
            <div class="${styles.companyMarker}">
              🏢
            </div>
          `,
          offset: new AMap.Pixel(-15, -15),
          draggable: false,
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
        if (isDestroyedRef.current) return;
        console.error('地图加载失败:', e);
        const msg = e?.message || String(e);
        if (msg.includes('INVALID_USER_DOMAIN') || msg.includes('INVALID_USER_SCODE')) {
          setMapError({
            type: 'domain',
            message: '当前域名未在高德控制台白名单中，请将访问域名添加到高德应用的「域名白名单」设置中。',
          });
        } else {
          setMapError({
            type: 'generic',
            message: `地图加载失败：${msg}`,
          });
        }
      });
    });

    return () => {
      isDestroyedRef.current = true;
      if (layoutSyncRafRef.current != null) {
        cancelAnimationFrame(layoutSyncRafRef.current);
        layoutSyncRafRef.current = null;
      }
      layoutSyncStateRef.current = null;
      if (legendRef.current) {
        legendRef.current.remove();
      }
      // Clean up cluster
      if (clusterRef.current) {
        try {
          (clusterRef.current as { setMap: (m: null) => void }).setMap(null);
        } catch {
          // ignore
        }
        clusterRef.current = null;
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
      setMapError(null);
    };
  }, [extractLngLat, mapDisabled]);

  useEffect(() => {
    if (!mapReady) return;
    scheduleViewportSync('mapReady');
  }, [mapReady, scheduleViewportSync]);

  useEffect(() => {
    if (!mapReady) return;
    scheduleViewportSync('viewportChange');
  }, [mapReady, selectedCommunity, previewCommunity, scheduleViewportSync]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!mapReady || !map || !el) return;

    const observer = new ResizeObserver(() => {
      scheduleViewportSync('resizeObserver');
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [mapReady, scheduleViewportSync]);

  useEffect(() => {
    if (!mapReady) return;
    const handler = () => scheduleViewportSync('windowResize');
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }, [mapReady, scheduleViewportSync]);

  useEffect(() => {
    if (!mapReady) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () => scheduleViewportSyncRef.current('visualViewport');
    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    return () => {
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
    };
  }, [mapReady]);

  // 添加小区标记（带聚合）
  useEffect(() => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    if (!map || !mapReady || !AMap) return;

    // 清除旧的聚合实例
    const oldCluster = clusterRef.current as { setMap?: (m: unknown) => void; destroy?: () => void } | null;
    if (oldCluster) {
      try { oldCluster.setMap?.(null); } catch { /* ignore */ }
      try { oldCluster.destroy?.(); } catch { /* ignore */ }
      clusterRef.current = null;
    }

    // 清除旧标记
    markersRef.current.forEach(marker => {
      try { marker.setMap(null); } catch { /* ignore */ }
    });
    markersRef.current.clear();
    tooltipMarkersRef.current.forEach(m => {
      try { m.setMap(null); } catch { /* ignore */ }
    });
    tooltipMarkersRef.current.clear();

    // 格式化价格 (简化为 k 单位)
    const formatPrice = (min: number, max: number): string => {
      if (min === max) return formatK(min);
      return `${formatK(min)}-${formatK(max)}`;
    };

    // 准备聚合数据点
    const companyCoords = normalizeLngLat(COMPANY_COORDS) ?? COMPANY_COORDS;
    const clusterPoints = communities
      .map(community => {
        const coords = normalizeLngLat(community.coordinates);
        if (!coords) return null;
        const distance = calculateDistanceMeters(coords, companyCoords);
        const isRecommended = distance <= RECOMMEND_RADIUS;
        return { lnglat: coords, name: community.name, id: community.id, community, isRecommended };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    // 尝试使用 MarkerCluster 聚合
    const MarkerClusterCtor = (AMap as Record<string, unknown>).MarkerCluster as
      | (new (map: unknown, data: unknown[], opts: Record<string, unknown>) => { setMap: (m: unknown) => void; destroy: () => void })
      | undefined;

    if (MarkerClusterCtor && clusterPoints.length > 0) {
      try {
        const cluster = new MarkerClusterCtor(map, clusterPoints as unknown[], {
          gridSize: 60,
          maxZoom: 14,
          renderMarker: (context: Record<string, unknown>) => {
            const data = context.data as { community: Community; isRecommended: boolean; id: string }[];
            const community = data[0]?.community;
            const isRecommended = data[0]?.isRecommended ?? false;
            if (!community) return;

            const markerObj = context.marker as AMapMarker;
            markerObj.setContent(`
              <div class="${styles.communityLabel}" data-community-id="${community.id}" style="background: ${isRecommended ? 'rgba(76, 175, 80, 0.9)' : 'rgba(150, 150, 150, 0.9)'}">
                <span class="${styles.communityIcon}">🏠</span>
                <span class="${styles.communityName}">${community.name}</span>
              </div>
            `);

            // Hover tooltip
            markerObj.on('mouseover', (e: unknown) => {
              if (previewCommunityRef.current?.id === community.id) return;
              // Skip if tooltip already exists for this community
              if (tooltipMarkersRef.current.has(`tooltip-${community.id}`)) return;
              const priceText = formatPricePerRoom(community.pricePerRoomStats?.avg)
                ?? `¥${formatPrice(community.price.min, community.price.max)}/月`;
              const distText = community.commute
                ? `${community.commute.roadDistanceKm}km · 步行${community.commute.walkMinutes}min · 骑行${community.commute.bikeMinutes}min`
                : `${community.distance} · 骑行${community.bikeTime}`;
              const tooltipMarker = new AMap.Marker({
                position: (() => {
                  const pos = (e as AMapEventWithTarget).target.getPosition();
                  return [pos.lng, pos.lat] as [number, number];
                })(),
                content: `<div class="${styles.hoverTooltip}" style="pointer-events:none;"><div class="${styles.tooltipRow}" style="pointer-events:none;">${distText}</div><div class="${styles.tooltipRow}" style="pointer-events:none;">${priceText}</div></div>`,
                offset: new AMap.Pixel(-60, -60),
                zIndex: 9999,
              });
              tooltipMarker.setMap(map);
              tooltipMarkersRef.current.set(`tooltip-${community.id}`, tooltipMarker);
            });

            markerObj.on('mouseout', () => {
              const cid = community.id;
              const key = `tooltip-${cid}`;
              // Short delay to avoid flicker when cursor briefly leaves and re-enters
              setTimeout(() => {
                const tm = tooltipMarkersRef.current.get(key);
                if (tm) { tm.setMap(null); tooltipMarkersRef.current.delete(key); }
              }, 80);
            });

            markerObj.on('click', () => {
              onPreviewCommunity(community);
            });

            markersRef.current.set(community.id, markerObj);
          },
          renderClusterMarker: (context: Record<string, unknown>) => {
            const count = context.count as number;
            const markerObj = context.marker as AMapMarker;
            markerObj.setContent(`
              <div class="${styles.clusterMarker}">
                <span>${count}</span>
              </div>
            `);
          },
        });

        clusterRef.current = cluster;
        return; // cluster handles markers
      } catch {
        // MarkerCluster failed, fall through to manual markers
        clusterRef.current = null;
      }
    }

    // Fallback: manual markers (no cluster)
    communities.forEach(community => {
      const currentCoords = normalizeLngLat(community.coordinates);
      if (!currentCoords) return;

      const distance = calculateDistanceMeters(currentCoords, companyCoords);
      const isRecommended = distance <= RECOMMEND_RADIUS;

      const marker = new AMap.Marker({
        position: currentCoords,
        title: community.name,
        content: `
          <div class="${styles.communityLabel}" data-community-id="${community.id}" style="background: ${isRecommended ? 'rgba(76, 175, 80, 0.9)' : 'rgba(150, 150, 150, 0.9)'}">
            <span class="${styles.communityIcon}">🏠</span>
            <span class="${styles.communityName}">${community.name}</span>
          </div>
        `,
        offset: new AMap.Pixel(-50, -15),
        zIndex: 100,
      });

      marker.on('mouseover', (e: unknown) => {
        if (previewCommunityRef.current?.id === community.id) return;
        // Skip if tooltip already exists for this community
        if (tooltipMarkersRef.current.has(`tooltip-${community.id}`)) return;
        const priceText = formatPricePerRoom(community.pricePerRoomStats?.avg)
          ?? `¥${formatPrice(community.price.min, community.price.max)}/月`;
        const distText = community.commute
          ? `${community.commute.roadDistanceKm}km · 步行${community.commute.walkMinutes}min · 骑行${community.commute.bikeMinutes}min`
          : `${community.distance} · 骑行${community.bikeTime}`;
        const tooltipMarker = new AMap.Marker({
          position: (() => {
            const pos = (e as AMapEventWithTarget).target.getPosition();
            return [pos.lng, pos.lat] as [number, number];
          })(),
          content: `<div class="${styles.hoverTooltip}" style="pointer-events:none;"><div class="${styles.tooltipRow}" style="pointer-events:none;">${distText}</div><div class="${styles.tooltipRow}" style="pointer-events:none;">${priceText}</div></div>`,
          offset: new AMap.Pixel(-60, -60),
          zIndex: 9999,
        });
        tooltipMarker.setMap(map);
        tooltipMarkersRef.current.set(`tooltip-${community.id}`, tooltipMarker);
      });

      marker.on('mouseout', () => {
        const cid = community.id;
        const key = `tooltip-${cid}`;
        // Short delay to avoid flicker when cursor briefly leaves and re-enters
        setTimeout(() => {
          const tm = tooltipMarkersRef.current.get(key);
          if (tm) { tm.setMap(null); tooltipMarkersRef.current.delete(key); }
        }, 80);
      });

      marker.on('click', () => {
        onPreviewCommunity(community);
      });

      marker.setMap(map);
      markersRef.current.set(community.id, marker);
    });
  }, [communities, mapReady, onPreviewCommunity]);

  // 处理 hover 高亮
  useEffect(() => {
    if (!mapReady) return;

    // 通过 AMap setzIndex 提升 hover 的 marker 层级
    markersRef.current.forEach((marker, key) => {
      if (hoveredCommunity && key === hoveredCommunity.id) {
        marker.setzIndex(9998);
      } else {
        marker.setzIndex(100);
      }
    });

    // 同时保留 CSS 高亮效果（缩放、阴影）
    const labelEls = document.querySelectorAll(`.${styles.communityLabel}`);
    labelEls.forEach((el) => {
      const communityId = el.getAttribute('data-community-id');
      if (hoveredCommunity && hoveredCommunity.id === communityId) {
        el.classList.add(styles.communityLabelHovered);
      } else {
        el.classList.remove(styles.communityLabelHovered);
      }
    });
  }, [hoveredCommunity, mapReady]);

  // 预览弹窗
  useEffect(() => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    if (!mapReady || !map || !AMap) return;

    if (previewPopupMarkerRef.current) {
      previewPopupMarkerRef.current.setMap(null);
      previewPopupMarkerRef.current = null;
    }

    if (!previewCommunity || selectedCommunity) return;

    const coords = normalizeLngLat(previewCommunity.coordinates);
    if (!coords) return;

    const priceMin = previewCommunity.price?.min ?? 0;
    const priceMax = previewCommunity.price?.max ?? 0;
    const fallbackPriceText = priceMin === priceMax ? `${Math.round(priceMin / 1000)}k` : `${Math.round(priceMin / 1000)}-${Math.round(priceMax / 1000)}k`;
    const priceText = formatPricePerRoom(previewCommunity.pricePerRoomStats?.avg)
      ?? `¥${fallbackPriceText}/月`;

    const commuteText = previewCommunity.commute
      ? `${previewCommunity.commute.roadDistanceKm}km · 步行${previewCommunity.commute.walkMinutes}min · 骑行${previewCommunity.commute.bikeMinutes}min`
      : `${previewCommunity.distance} · ${previewCommunity.bikeTime}`;

    const popup = new AMap.Marker({
      position: coords,
      content: `
        <div class="${styles.previewPopup}">
          <div class="${styles.previewTitle}">🏠 ${previewCommunity.name}</div>
          <div class="${styles.previewMeta}">${commuteText}</div>
          <div class="${styles.previewMeta}">${priceText}</div>
          <div class="${styles.previewHint}">点击查看详情</div>
        </div>
      `,
      offset: new AMap.Pixel(-70, -86),
      zIndex: 9997,
    });

    popup.on('click', () => onSelectCommunity(previewCommunity));
    popup.setMap(map);
    previewPopupMarkerRef.current = popup;

    return () => {
      if (previewPopupMarkerRef.current) {
        previewPopupMarkerRef.current.setMap(null);
        previewPopupMarkerRef.current = null;
      }
    };
  }, [mapReady, previewCommunity, selectedCommunity, onSelectCommunity]);

  // 居中到公司位置
  const handleCenterToCompany = () => {
    onSelectCommunity(null);
    onPreviewCommunity(null);
    requestAnimationFrame(() => scheduleViewportSyncRef.current('centerButton'));
  };

  return (
    <div
      ref={containerRef}
      className={styles.container}
      data-testid="map-root"
    >
      {!mapReady && !mapError && (
        <div className={styles.loading}>
          {mapDisabled ? '地图在测试环境已禁用' : '地图加载中...'}
        </div>
      )}
      {mapError && (
        <div className={styles.errorPanel}>
          <div className={styles.errorIcon}>⚠️</div>
          <div className={styles.errorTitle}>
            {mapError.type === 'domain' ? '地图域名未授权' : '地图加载失败'}
          </div>
          <div className={styles.errorMessage}>{mapError.message}</div>
          {mapError.type === 'domain' && (
            <div className={styles.errorHint}>
              解决方法：前往 <a href="https://console.amap.com" target="_blank" rel="noopener noreferrer">高德控制台</a> → 应用管理 → 我的应用 → 找到对应 Key → 平台选择「Web端(JS API)」→ 在「域名白名单」中添加当前访问域名。
            </div>
          )}
        </div>
      )}
      {mapReady && (
        <>
          <button
            className={styles.centerButton}
            onClick={handleCenterToCompany}
            title="居中到公司"
          >
            🏢
          </button>
        </>
      )}
    </div>
  );
}
