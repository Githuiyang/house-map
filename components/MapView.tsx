'use client';

import { useEffect, useRef, useState } from 'react';
import type { Community } from '@/types/community';
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

interface MapViewProps {
  communities: Community[];
  selectedCommunity: Community | null;
  hoveredCommunity: Community | null;
  onSelectCommunity: (community: Community | null) => void;
}

// 公司坐标：杨浦区淞沪路303号 创智天地 11号楼
// 高德地图格式：[经度, 纬度]
const COMPANY_COORDS: [number, number] = [121.512568, 31.304715];
const RECOMMEND_RADIUS = 3000; // 推荐范围3公里（米）

// 调试地标（GCJ-02 坐标，从高德地图获取）- 已废弃，坐标不准
const DEBUG_LANDMARKS: { name: string; coords: [number, number] }[] = [];

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

function normalizeLngLat(coords: [number, number]): [number, number] | null {
  const [a, b] = coords;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  const normalized: [number, number] = Math.abs(a) <= 90 && Math.abs(b) > 90 ? [b, a] : [a, b];
  const [lng, lat] = normalized;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return normalized;
}

export default function MapView({ communities, selectedCommunity, hoveredCommunity, onSelectCommunity }: MapViewProps) {
  const mapRef = useRef<AMapMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, AMapMarker>>(new Map());
  const circleRef = useRef<AMapCircle | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const AMapRef = useRef<AMapApi | null>(null);
  const isInitializedRef = useRef(false);
  const isDestroyedRef = useRef(false);
  const legendRef = useRef<HTMLDivElement | null>(null);
  const didInitialCenterRef = useRef(false);

  // 编辑模式状态
  const [editMode, setEditMode] = useState(false);
  const [modifiedCoords, setModifiedCoords] = useState<Map<string, { original: [number, number], modified: [number, number] }>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const companyMarkerRef = useRef<AMapMarker | null>(null);
  const [modifiedCompanyCoords, setModifiedCompanyCoords] = useState<[number, number] | null>(null);

  // 初始化地图
  useEffect(() => {
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
          zoom: 13, // zoom=13 显示约4-5km 范围
          center: initialCompanyCoords,
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
      didInitialCenterRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || didInitialCenterRef.current) return;
    didInitialCenterRef.current = true;
    const companyCoords = normalizeLngLat(COMPANY_COORDS) ?? COMPANY_COORDS;
    mapRef.current.setCenter(companyCoords);
    mapRef.current.setZoom(13);
  }, [mapReady]);

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

      const companyCoords = normalizeLngLat(modifiedCompanyCoords || COMPANY_COORDS) ?? (modifiedCompanyCoords || COMPANY_COORDS);
      const distance = calculateDistance(currentCoords, companyCoords);
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
          onSelectCommunity(community);
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
          const distance = calculateDistance(newCoords, modifiedCompanyCoords || COMPANY_COORDS);
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
  }, [communities, mapReady, onSelectCommunity, editMode, modifiedCoords, modifiedCompanyCoords]);

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

  // 点击小区时定位到该小区
  useEffect(() => {
    if (!mapReady || !selectedCommunity || !mapRef.current) return;

    const coords = normalizeLngLat(selectedCommunity.coordinates);
    if (!coords) return;
    mapRef.current.setCenter(coords);
    mapRef.current.setZoom(15);  // 放大一点，方便看清楚
  }, [selectedCommunity, mapReady]);

  // 居中到公司位置
  const handleCenterToCompany = () => {
    if (mapRef.current) {
      const coords = normalizeLngLat(modifiedCompanyCoords || COMPANY_COORDS) ?? (modifiedCompanyCoords || COMPANY_COORDS);
      mapRef.current.setCenter(coords);
      mapRef.current.setZoom(13);
    }
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
      {!mapReady && <div className={styles.loading}>地图加载中...</div>}
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
        </>
      )}
    </div>
  );
}
