'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Community } from '@/types/community';
import { calculateDistanceMeters, normalizeLngLat } from '@/utils/geo';
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
  on?: (event: string, handler: () => void) => void;
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

type DebugSnapshot = {
  label: string;
  time: string;
  company: [number, number];
  center: [number, number] | null;
  zoom: number | null;
  distanceMeters: number | null;
  viewport: { w: number; h: number };
  container: { w: number; h: number } | null;
  dpr: number;
  ua: string;
};

interface MapViewProps {
  communities: Community[];
  selectedCommunity: Community | null;
  previewCommunity: Community | null;
  hoveredCommunity: Community | null;
  onSelectCommunity: (community: Community | null) => void;
  onPreviewCommunity: (community: Community | null) => void;
}

// 公司坐标：杨浦区淞沪路303号 创智天地 11号楼
// 高德地图格式：[经度, 纬度]
const COMPANY_COORDS: [number, number] = [121.512568, 31.304715];
const RECOMMEND_RADIUS = 3000; // 推荐范围3公里（米）
const DEFAULT_ZOOM = 16;
const SELECTED_ZOOM = 17;

// 调试地标（GCJ-02 坐标，从高德地图获取）- 已废弃，坐标不准
const DEBUG_LANDMARKS: { name: string; coords: [number, number] }[] = [];

export default function MapView({ communities, selectedCommunity, previewCommunity, hoveredCommunity, onSelectCommunity, onPreviewCommunity }: MapViewProps) {
  const mapRef = useRef<AMapMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, AMapMarker>>(new Map());
  const circleRef = useRef<AMapCircle | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapDisabled = process.env.NEXT_PUBLIC_DISABLE_MAP === '1';
  const AMapRef = useRef<AMapApi | null>(null);
  const isInitializedRef = useRef(false);
  const isDestroyedRef = useRef(false);
  const legendRef = useRef<HTMLDivElement | null>(null);
  const debugEnabledRef = useRef(false);
  const layoutSyncRafRef = useRef<number | null>(null);
  const layoutSyncStateRef = useRef<{ start: number; lastW: number; lastH: number; stable: number; reason: string } | null>(null);

  // 编辑模式状态
  const [editMode, setEditMode] = useState(false);
  const [modifiedCoords, setModifiedCoords] = useState<Map<string, { original: [number, number], modified: [number, number] }>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const companyMarkerRef = useRef<AMapMarker | null>(null);
  const [modifiedCompanyCoords, setModifiedCompanyCoords] = useState<[number, number] | null>(null);
  const previewPopupMarkerRef = useRef<AMapMarker | null>(null);

  const [debugMode, setDebugMode] = useState(false);
  const [debugSnapshots, setDebugSnapshots] = useState<DebugSnapshot[]>([]);
  const [debugCollapsed, setDebugCollapsed] = useState(false);
  const [debugCopied, setDebugCopied] = useState(false);

  const getCompanyCoords = useCallback((): [number, number] => {
    const raw = modifiedCompanyCoords || COMPANY_COORDS;
    return normalizeLngLat(raw) ?? raw;
  }, [modifiedCompanyCoords]);

  const getDesiredCenter = useCallback((): [number, number] => {
    if (selectedCommunity) {
      const coords = normalizeLngLat(selectedCommunity.coordinates);
      if (coords) return coords;
    }
    if (previewCommunity) {
      const coords = normalizeLngLat(previewCommunity.coordinates);
      if (coords) return coords;
    }
    return getCompanyCoords();
  }, [getCompanyCoords, previewCommunity, selectedCommunity]);

  const getDesiredZoom = useCallback(() => {
    if (selectedCommunity) return SELECTED_ZOOM;
    return DEFAULT_ZOOM;
  }, [selectedCommunity]);

  const applyDesiredViewport = useCallback((label: string) => {
    const map = mapRef.current;
    if (!map) return;

    map.resize?.();
    if (!editMode) {
      map.setZoom(getDesiredZoom());
      map.setCenter(getDesiredCenter());
    }
    pushDebugSnapshotRef.current(`viewport:${label}`);
  }, [editMode, getDesiredCenter, getDesiredZoom]);

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

    layoutSyncStateRef.current = { start: performance.now(), lastW: -1, lastH: -1, stable: 0, reason };

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
      const changed = w !== state.lastW || h !== state.lastH;
      if (changed) {
        state.lastW = w;
        state.lastH = h;
        state.stable = 0;
      } else {
        state.stable += 1;
      }

      applyDesiredViewportRef.current(`${state.reason}:${w}x${h}:stable${state.stable}`);

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

  const detectDebugMode = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('debug');
    if (q === '1' || q === 'true') return true;
    try {
      return window.localStorage.getItem('office-map-debug') === '1';
    } catch {
      return false;
    }
  }, []);

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

  const pushDebugSnapshot = useCallback((label: string) => {
    if (!debugEnabledRef.current) return;
    const map = mapRef.current;
    const company = getCompanyCoords();
    const center = map ? extractLngLat(map.getCenter?.()) : null;
    const zoom = map?.getZoom?.() ?? null;
    const container = containerRef.current;
    const containerRect = container ? container.getBoundingClientRect() : null;
    const snapshot: DebugSnapshot = {
      label,
      time: new Date().toISOString(),
      company,
      center,
      zoom: typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : null,
      distanceMeters: center ? calculateDistanceMeters(center, company) : null,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      container: containerRect ? { w: Math.round(containerRect.width), h: Math.round(containerRect.height) } : null,
      dpr: window.devicePixelRatio || 1,
      ua: navigator.userAgent,
    };
    setDebugSnapshots(prev => [...prev, snapshot].slice(-25));
  }, [extractLngLat, getCompanyCoords]);

  const pushDebugSnapshotRef = useRef<(label: string) => void>(() => {});
  useEffect(() => {
    pushDebugSnapshotRef.current = pushDebugSnapshot;
  }, [pushDebugSnapshot]);

  useEffect(() => {
    const enabled = detectDebugMode();
    debugEnabledRef.current = enabled;
    setDebugMode(enabled);
  }, [detectDebugMode]);

  const debugSummary = useMemo(() => {
    const last = debugSnapshots[debugSnapshots.length - 1] ?? null;
    const first = debugSnapshots[0] ?? null;
    return { first, last, count: debugSnapshots.length };
  }, [debugSnapshots]);

  const copyDebugInfo = useCallback(async () => {
    if (!debugEnabledRef.current) return;
    const payload = {
      companyCoords: getCompanyCoords(),
      snapshots: debugSnapshots,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setDebugCopied(true);
      setTimeout(() => setDebugCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [debugSnapshots, getCompanyCoords]);

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
      // 注意: API Key 会暴露在客户端代码中
      // 请确保在高德地图控制台设置域名白名单限制
      window._AMapSecurityConfig = {
        securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECURITY_KEY || '',
      };

      AMapLoader.default.load({
        key: process.env.NEXT_PUBLIC_AMAP_KEY || '',
        version: '2.0',
        plugins: ['AMap.Scale'],
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
          pushDebugSnapshotRef.current('complete:before');
          scheduleViewportSyncRef.current('complete');
          requestAnimationFrame(() => {
            if (isDestroyedRef.current) return;
            pushDebugSnapshotRef.current('complete:after');
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
              <div style="font-size: 10px; color: #333; margin-top: 2px;">
                ${initialCompanyCoords[0].toFixed(4)}, ${initialCompanyCoords[1].toFixed(4)}
              </div>
            </div>
          `,
          offset: new AMap.Pixel(-30, -15),
          draggable: false, // 初始不可拖拽
        });

        // 公司标记拖拽事件
        companyMarker.on('dragging', (e: unknown) => {
          const pos = (e as AMapEventWithTarget).target.getPosition();
          const newCoords: [number, number] = [pos.lng, pos.lat];
          setModifiedCompanyCoords(newCoords);
        });

        companyMarker.on('dragend', (e: unknown) => {
          const pos = (e as AMapEventWithTarget).target.getPosition();
          const newCoords: [number, number] = [pos.lng, pos.lat];

          // 更新3km圆心
          if (circleRef.current) {
            circleRef.current.setCenter(newCoords);
          }

          // 更新标记显示
          (e as AMapEventWithTarget).target.setContent?.(`
            <div class="${styles.companyMarker} ${styles.editingMarker}">
              🏢
              <div style="font-size: 10px; color: #333; margin-top: 2px;">
                ${newCoords[0].toFixed(4)}, ${newCoords[1].toFixed(4)}
              </div>
            </div>
          `);
        });

        companyMarker.setMap(map);
        companyMarkerRef.current = companyMarker;

        // 调试：添加地标（用于校正坐标）
        DEBUG_LANDMARKS.forEach(landmark => {
          const marker = new AMap.Marker({
            position: landmark.coords,
            title: landmark.name,
            content: `
              <div style="
                background: rgba(255, 140, 0, 0.9);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                white-space: nowrap;
                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
              ">
                ${landmark.name}
              </div>
            `,
            offset: new AMap.Pixel(-40, -15),
          });
          marker.setMap(map);
        });

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
        pushDebugSnapshotRef.current('created');
      }).catch((e: Error) => {
        console.error('地图加载失败:', e);
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
  }, [mapDisabled]);

  useEffect(() => {
    if (!mapReady) return;
    scheduleViewportSync('mapReady');
  }, [mapReady, scheduleViewportSync]);

  useEffect(() => {
    if (!mapReady) return;
    scheduleViewportSync('viewportChange');
  }, [mapReady, selectedCommunity, previewCommunity, modifiedCompanyCoords, editMode, scheduleViewportSync]);

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

  // 添加小区标记
  useEffect(() => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    if (!map || !mapReady || !AMap) return;

    // 清除旧标记
    markersRef.current.forEach(marker => {
      try {
        marker.setMap(null);
      } catch {
        // 忽略已销毁的标记
      }
    });
    markersRef.current.clear();

    // 添加新标记 - 使用图标+小区名
    communities.forEach(community => {
      const isModified = modifiedCoords.has(community.id);
      const currentCoordsRaw = isModified ? modifiedCoords.get(community.id)!.modified : community.coordinates;
      const currentCoords = normalizeLngLat(currentCoordsRaw);
      if (!currentCoords) return;

      const companyCoords = getCompanyCoords();
      const distance = calculateDistanceMeters(currentCoords, companyCoords);
      const isRecommended = distance <= RECOMMEND_RADIUS;

      const marker = new AMap.Marker({
        position: currentCoords,
        title: community.name,
        content: `
          <div class="${styles.communityLabel} ${editMode ? styles.editingMarker : ''}" data-community-id="${community.id}" style="background: ${isRecommended ? 'rgba(76, 175, 80, 0.9)' : 'rgba(150, 150, 150, 0.9)'}">
            <span class="${styles.communityIcon}">🏠</span>
            <span class="${styles.communityName}">${community.name}</span>
            ${isModified ? `<span class="${styles.modifiedBadge}">✓</span>` : ''}
          </div>
        `,
        offset: new AMap.Pixel(-50, -15),
        draggable: editMode, // 编辑模式下可拖拽
      });

      // 格式化价格 (简化为 k 单位)
      const formatPrice = (min: number, max: number): string => {
        const formatK = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
        if (min === max) return formatK(min);
        return `${formatK(min)}-${formatK(max)}`;
      };

      // Hover tooltip - 只显示简单信息
      marker.on('mouseover', (e: unknown) => {
        const priceText = formatPrice(community.price.min, community.price.max);
        const tooltipContent = `
          <div class="${styles.hoverTooltip}">
            <div class="${styles.tooltipRow}">${community.distance} · 骑行${community.bikeTime}</div>
            <div class="${styles.tooltipRow}">¥${priceText}/月</div>
          </div>
        `;

        // 创建 tooltip marker
        const tooltipMarker = new AMap.Marker({
          position: (() => {
            const pos = (e as AMapEventWithTarget).target.getPosition();
            return [pos.lng, pos.lat] as [number, number];
          })(),
          content: tooltipContent,
          offset: new AMap.Pixel(-60, -60),
          zIndex: 200,
        });
        tooltipMarker.setMap(map);
        markersRef.current.set(`tooltip-${community.id}`, tooltipMarker);
      });

      marker.on('mouseout', () => {
        // 移除 tooltip
        const tooltipMarker = markersRef.current.get(`tooltip-${community.id}`);
        if (tooltipMarker) {
          tooltipMarker.setMap(null);
          markersRef.current.delete(`tooltip-${community.id}`);
        }
      });

      // 点击弹出详情卡片
      marker.on('click', () => {
        if (!editMode) {
          onPreviewCommunity(community);
        }
      });

      // 编辑模式下的拖拽事件
      if (editMode) {
        marker.on('dragstart', () => {
          setDraggingId(community.id);
        });

        marker.on('dragend', (e: unknown) => {
          const pos = (e as AMapEventWithTarget).target.getPosition();
          const newCoords: [number, number] = [pos.lng, pos.lat];

          setModifiedCoords(prev => {
            const updated = new Map(prev);
            updated.set(community.id, {
              original: community.coordinates,
              modified: newCoords
            });
            return updated;
          });

          setDraggingId(null);

          // 更新标记显示,添加修改标记
          const distance = calculateDistanceMeters(newCoords, modifiedCompanyCoords || COMPANY_COORDS);
          const isRecommended = distance <= RECOMMEND_RADIUS;
          (e as AMapEventWithTarget).target.setContent?.(`
            <div class="${styles.communityLabel} ${styles.editingMarker}" data-community-id="${community.id}" style="background: ${isRecommended ? 'rgba(76, 175, 80, 0.9)' : 'rgba(150, 150, 150, 0.9)'}">
              <span class="${styles.communityIcon}">🏠</span>
              <span class="${styles.communityName}">${community.name}</span>
              <span class="${styles.modifiedBadge}">✓</span>
            </div>
          `);
        });
      }

      marker.setMap(map);
      markersRef.current.set(community.id, marker);
    });
  }, [communities, mapReady, onPreviewCommunity, editMode, modifiedCoords, modifiedCompanyCoords, getCompanyCoords]);

  // 处理 hover 高亮
  useEffect(() => {
    if (!mapReady) return;

    // 直接通过 DOM 查询所有标记元素（marker.getContent() 返回字符串，无法用 querySelector）
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

  useEffect(() => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    if (!mapReady || !map || !AMap) return;

    if (previewPopupMarkerRef.current) {
      previewPopupMarkerRef.current.setMap(null);
      previewPopupMarkerRef.current = null;
    }

    if (!previewCommunity || editMode || selectedCommunity) return;

    const coords = normalizeLngLat(previewCommunity.coordinates);
    if (!coords) return;

    const priceMin = previewCommunity.price?.min ?? 0;
    const priceMax = previewCommunity.price?.max ?? 0;
    const priceText = priceMin === priceMax ? `${Math.round(priceMin / 1000)}k` : `${Math.round(priceMin / 1000)}-${Math.round(priceMax / 1000)}k`;

    const popup = new AMap.Marker({
      position: coords,
      content: `
        <div class="${styles.previewPopup}">
          <div class="${styles.previewTitle}">🏠 ${previewCommunity.name}</div>
          <div class="${styles.previewMeta}">${previewCommunity.distance} · ${priceText}</div>
          <div class="${styles.previewHint}">点击查看详情</div>
        </div>
      `,
      offset: new AMap.Pixel(-70, -86),
      zIndex: 300,
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
  }, [mapReady, previewCommunity, editMode, selectedCommunity, onSelectCommunity]);

  // 居中到公司位置
  const handleCenterToCompany = () => {
    onSelectCommunity(null);
    onPreviewCommunity(null);
    requestAnimationFrame(() => scheduleViewportSyncRef.current('centerButton'));
  };

  // 切换编辑模式
  const toggleEditMode = () => {
    const newEditMode = !editMode;
    setEditMode(newEditMode);

    if (!newEditMode) {
      // 退出编辑模式时,清除所有修改状态
      setModifiedCoords(new Map());
      setModifiedCompanyCoords(null);
      setDraggingId(null);
    }

    // 更新公司标记的可拖拽状态
    if (companyMarkerRef.current) {
      companyMarkerRef.current.setDraggable(newEditMode);
      if (!newEditMode) {
        // 退出编辑模式时恢复原始坐标和显示
        companyMarkerRef.current.setPosition(COMPANY_COORDS);
        companyMarkerRef.current.setContent(`
          <div class="${styles.companyMarker}">
            🏢
            <div style="font-size: 10px; color: #333; margin-top: 2px;">
              ${COMPANY_COORDS[0].toFixed(4)}, ${COMPANY_COORDS[1].toFixed(4)}
            </div>
          </div>
        `);
        // 恢复3km圆心
        if (circleRef.current) {
          circleRef.current.setCenter(COMPANY_COORDS);
        }
      }
    }
  };

  // 复制更新后的坐标
  const copyCoordinates = async () => {
    const updates: Array<{
      id?: string;
      type?: 'company';
      coordinates: [number, number];
      note?: string;
    }> = [];

    // 添加小区坐标更新
    modifiedCoords.forEach((value, id) => {
      updates.push({
        id,
        coordinates: value.modified
      });
    });

    // 如果公司坐标也被修改,添加到更新列表
    if (modifiedCompanyCoords) {
      updates.push({
        type: 'company',
        coordinates: modifiedCompanyCoords,
        note: '公司坐标(需要更新COMPANY_COORDS常量)'
      });
    }

    const jsonStr = JSON.stringify(updates, null, 2);

    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <div ref={containerRef} className={styles.container}>
      {!mapReady && (
        <div className={styles.loading}>
          {mapDisabled ? '地图在测试环境已禁用' : '地图加载中...'}
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

          <button
            className={`${styles.editButton} ${editMode ? styles.editButtonActive : ''}`}
            onClick={toggleEditMode}
            title={editMode ? '退出编辑模式' : '进入编辑模式'}
          >
            {editMode ? '✓ 编辑中' : '✏️ 编辑'}
          </button>

          {editMode && (
            <div className={styles.editModeHint}>
              拖拽标记修正位置,完成后点击复制坐标
            </div>
          )}

          {editMode && modifiedCoords.size > 0 && (
            <button
              className={styles.copyButton}
              onClick={copyCoordinates}
            >
              {copiedMessage ? '✓ 已复制' : `📋 复制坐标 (${modifiedCoords.size})`}
            </button>
          )}

          {editMode && draggingId && (
            <div className={styles.draggingInfo}>
              正在拖拽: {communities.find(c => c.id === draggingId)?.name}
            </div>
          )}

          {editMode && modifiedCoords.size > 0 && (
            <div className={styles.modifiedList}>
              <div className={styles.modifiedListTitle}>已修改:</div>
              {Array.from(modifiedCoords.entries()).map(([id, coords]) => {
                const community = communities.find(c => c.id === id);
                return (
                  <div key={id} className={styles.modifiedItem}>
                    <strong>{community?.name}</strong>:<br />
                    [{coords.original[0].toFixed(4)}, {coords.original[1].toFixed(4)}] →<br />
                    [{coords.modified[0].toFixed(4)}, {coords.modified[1].toFixed(4)}]
                  </div>
                );
              })}
            </div>
          )}

          {debugMode && (
            <div className={`${styles.debugPanel} ${debugCollapsed ? styles.debugCollapsed : ''}`}>
              <div className={styles.debugHeader}>
                <div className={styles.debugTitle}>调试模式</div>
                <div className={styles.debugActions}>
                  <button className={styles.debugBtn} onClick={() => setDebugCollapsed(v => !v)}>
                    {debugCollapsed ? '展开' : '收起'}
                  </button>
                  <button className={styles.debugBtn} onClick={copyDebugInfo}>
                    {debugCopied ? '已复制' : '复制'}
                  </button>
                </div>
              </div>
              {!debugCollapsed && (
                <div className={styles.debugBody}>
                  <div className={styles.debugRow}>
                    <span className={styles.debugKey}>公司</span>
                    <span className={styles.debugVal}>{getCompanyCoords()[0].toFixed(6)}, {getCompanyCoords()[1].toFixed(6)}</span>
                  </div>
                  <div className={styles.debugRow}>
                    <span className={styles.debugKey}>采样</span>
                    <span className={styles.debugVal}>{debugSummary.count}</span>
                  </div>
                  {debugSummary.last && (
                    <>
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>最后中心</span>
                        <span className={styles.debugVal}>
                          {debugSummary.last.center ? `${debugSummary.last.center[0].toFixed(6)}, ${debugSummary.last.center[1].toFixed(6)}` : 'null'}
                        </span>
                      </div>
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>偏移</span>
                        <span className={styles.debugVal}>
                          {typeof debugSummary.last.distanceMeters === 'number' ? `${Math.round(debugSummary.last.distanceMeters)}m` : 'null'}
                        </span>
                      </div>
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>缩放</span>
                        <span className={styles.debugVal}>
                          {typeof debugSummary.last.zoom === 'number' ? debugSummary.last.zoom : 'null'}
                        </span>
                      </div>
                      <div className={styles.debugPre}>
                        {JSON.stringify(debugSummary.last, null, 2)}
                      </div>
                    </>
                  )}
                  {!debugSummary.last && (
                    <div className={styles.debugHint}>在 URL 加 ?debug=1 可开启；也可 localStorage.office-map-debug=1</div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
