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
  PlaceSearch?: new (opts: { city?: string; citylimit?: boolean }) => {
    search: (
      keyword: string,
      cb: (
        status: string,
        result?: {
          poiList?: {
            pois?: Array<{
              name?: string;
              location?: unknown;
            }>;
          };
        }
      ) => void
    ) => void;
  };
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
  seq: number;
  label: string;
  time: string;
  company: [number, number];
  center: [number, number] | null;
  zoom: number | null;
  distanceMeters: number | null;
  viewport: { w: number; h: number };
  visualViewport: { w: number; h: number; offsetLeft: number; offsetTop: number; scale: number } | null;
  screen: { w: number; h: number; availW: number; availH: number; pixelDepth: number };
  container: { w: number; h: number } | null;
  containerRect: { left: number; top: number; right: number; bottom: number; x: number; y: number; w: number; h: number } | null;
  dpr: number;
  platform: string;
  ua: string;
  pointer?: {
    client: { x: number; y: number };
    container: { x: number; y: number };
    rect: { left: number; top: number; w: number; h: number };
  };
  amapClick?: {
    lnglat: [number, number] | null;
    pixel: { x: number; y: number } | null;
    deltaPx: { x: number; y: number } | null;
  };
  hitTest?: {
    tag: string;
    id: string | null;
    className: string | null;
    inMap: boolean;
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

// 公司坐标：杨浦区淞沪路303号 创智天地 11号楼
// 高德地图格式：[经度, 纬度]
const COMPANY_COORDS: [number, number] = [121.512568, 31.304715];
const DESKTOP_CENTER_CORRECTION_BASELINE: [number, number] = [0, 0];
const DESKTOP_CENTER_CORRECTION_STORAGE_KEY = 'office-map-desktop-center-correction-v2';
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
  const layoutSyncStateRef = useRef<{ start: number; lastW: number; lastH: number; lastLeft: number; lastTop: number; stable: number; reason: string } | null>(null);

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
  const [pickMode, setPickMode] = useState(false);
  const [pickedPoint, setPickedPoint] = useState<[number, number] | null>(null);
  const [expectedLngInput, setExpectedLngInput] = useState('');
  const [expectedLatInput, setExpectedLatInput] = useState('');
  const [rematchRunning, setRematchRunning] = useState(false);
  const [rematchStats, setRematchStats] = useState<{ matched: number; total: number; unresolved: string[]; reason?: string } | null>(null);
  const [nudgeStepInput, setNudgeStepInput] = useState('0.000100');
  const [desktopCenterCorrection, setDesktopCenterCorrection] = useState<[number, number] | null>(DESKTOP_CENTER_CORRECTION_BASELINE);
  const pickModeRef = useRef(false);
  const debugSeqRef = useRef(0);
  const lastPointerRef = useRef<DebugSnapshot['pointer'] | null>(null);
  const lastInteractionSyncAtRef = useRef(0);
  const layoutModeRef = useRef<'desktop' | 'mobile' | null>(null);
  const [disabledLastClick, setDisabledLastClick] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    pickModeRef.current = pickMode;
  }, [pickMode]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DESKTOP_CENTER_CORRECTION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || parsed.length < 2) return;
      const lng = Number(parsed[0]);
      const lat = Number(parsed[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      setDesktopCenterCorrection([lng, lat]);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      if (!desktopCenterCorrection) {
        window.localStorage.removeItem(DESKTOP_CENTER_CORRECTION_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(DESKTOP_CENTER_CORRECTION_STORAGE_KEY, JSON.stringify(desktopCenterCorrection));
    } catch {
      // ignore
    }
  }, [desktopCenterCorrection]);

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

  const getLayoutMode = useCallback((): 'desktop' | 'mobile' => {
    return window.innerWidth <= 768 ? 'mobile' : 'desktop';
  }, []);

  const applyDesktopCorrection = useCallback((center: [number, number]): [number, number] => {
    if (typeof window === 'undefined') return center;
    if (getLayoutMode() !== 'desktop' || !desktopCenterCorrection) return center;
    return [center[0] + desktopCenterCorrection[0], center[1] + desktopCenterCorrection[1]];
  }, [desktopCenterCorrection, getLayoutMode]);

  const applyDesiredViewport = useCallback((label: string) => {
    const map = mapRef.current;
    if (!map) return;

    map.resize?.();
    const baseReason = label.split(':')[0] ?? '';
    const shouldApplyDesiredCenter = baseReason === 'viewportChange' || baseReason === 'mapReady' || baseReason === 'complete' || baseReason === 'created';
    if (!editMode && shouldApplyDesiredCenter) {
      map.setZoom(getDesiredZoom());
      map.setCenter(applyDesktopCorrection(getDesiredCenter()));
    }
    pushDebugSnapshotRef.current(`viewport:${label}`);
  }, [applyDesktopCorrection, editMode, getDesiredCenter, getDesiredZoom]);

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

  const pushDebugSnapshot = useCallback((label: string, extras?: Pick<DebugSnapshot, 'pointer' | 'amapClick' | 'hitTest'>) => {
    if (!debugEnabledRef.current) return;
    const map = mapRef.current;
    const company = getCompanyCoords();
    const center = map ? extractLngLat(map.getCenter?.()) : null;
    const zoom = map?.getZoom?.() ?? null;
    const container = containerRef.current;
    const containerRect = container ? container.getBoundingClientRect() : null;
    const vv = window.visualViewport;
    debugSeqRef.current += 1;
    const snapshot: DebugSnapshot = {
      seq: debugSeqRef.current,
      label,
      time: new Date().toISOString(),
      company,
      center,
      zoom: typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : null,
      distanceMeters: center ? calculateDistanceMeters(center, company) : null,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      visualViewport: vv
        ? {
            w: Math.round(vv.width),
            h: Math.round(vv.height),
            offsetLeft: Math.round(vv.offsetLeft),
            offsetTop: Math.round(vv.offsetTop),
            scale: Number(vv.scale.toFixed(4)),
          }
        : null,
      screen: {
        w: window.screen.width,
        h: window.screen.height,
        availW: window.screen.availWidth,
        availH: window.screen.availHeight,
        pixelDepth: window.screen.pixelDepth,
      },
      container: containerRect ? { w: Math.round(containerRect.width), h: Math.round(containerRect.height) } : null,
      containerRect: containerRect
        ? {
            left: Math.round(containerRect.left),
            top: Math.round(containerRect.top),
            right: Math.round(containerRect.right),
            bottom: Math.round(containerRect.bottom),
            x: Math.round(containerRect.x),
            y: Math.round(containerRect.y),
            w: Math.round(containerRect.width),
            h: Math.round(containerRect.height),
          }
        : null,
      dpr: window.devicePixelRatio || 1,
      platform: navigator.platform,
      ua: navigator.userAgent,
      pointer: extras?.pointer,
      amapClick: extras?.amapClick,
      hitTest: extras?.hitTest,
    };
    setDebugSnapshots(prev => [...prev, snapshot].slice(-25));
  }, [extractLngLat, getCompanyCoords]);

  const pushDebugSnapshotRef = useRef<(label: string, extras?: Pick<DebugSnapshot, 'pointer' | 'amapClick' | 'hitTest'>) => void>(() => {});
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

  const debugDelta = useMemo(() => {
    if (debugSnapshots.length < 2) return null;
    const prev = debugSnapshots[debugSnapshots.length - 2];
    const last = debugSnapshots[debugSnapshots.length - 1];
    return {
      viewportW: last.viewport.w - prev.viewport.w,
      viewportH: last.viewport.h - prev.viewport.h,
      rectLeft: (last.containerRect?.left ?? 0) - (prev.containerRect?.left ?? 0),
      rectTop: (last.containerRect?.top ?? 0) - (prev.containerRect?.top ?? 0),
      rectW: (last.containerRect?.w ?? 0) - (prev.containerRect?.w ?? 0),
      rectH: (last.containerRect?.h ?? 0) - (prev.containerRect?.h ?? 0),
      dpr: Number(((last.dpr ?? 0) - (prev.dpr ?? 0)).toFixed(4)),
      label: `${prev.label} -> ${last.label}`,
    };
  }, [debugSnapshots]);

  const calibrationResult = useMemo(() => {
    if (!pickedPoint) return null;
    const expectedLng = Number(expectedLngInput);
    const expectedLat = Number(expectedLatInput);
    if (!Number.isFinite(expectedLng) || !Number.isFinite(expectedLat)) return null;
    const clicked = pickedPoint;
    const expected: [number, number] = [expectedLng, expectedLat];
    const deltaLng = expected[0] - clicked[0];
    const deltaLat = expected[1] - clicked[1];
    const company = getCompanyCoords();
    const suggestedCenter: [number, number] = [company[0] + deltaLng, company[1] + deltaLat];
    return { clicked, expected, deltaLng, deltaLat, suggestedCenter };
  }, [expectedLatInput, expectedLngInput, getCompanyCoords, pickedPoint]);

  const nudgeStep = useMemo(() => {
    const n = Number(nudgeStepInput);
    if (!Number.isFinite(n) || n <= 0) return 0.0001;
    return n;
  }, [nudgeStepInput]);

  const adjustDesktopCorrection = useCallback((deltaLng: number, deltaLat: number) => {
    setDesktopCenterCorrection(prev => {
      const base = prev ?? DESKTOP_CENTER_CORRECTION_BASELINE;
      return [base[0] + deltaLng, base[1] + deltaLat];
    });
    scheduleViewportSyncRef.current('desktopCorrection:nudge');
  }, []);

  const alignCurrentCenterToCompany = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getCenter) return;
    const center = extractLngLat(map.getCenter());
    if (!center) return;
    const company = getCompanyCoords();
    const correction: [number, number] = [company[0] - center[0], company[1] - center[1]];
    setDesktopCenterCorrection(correction);
    scheduleViewportSyncRef.current('desktopCorrection:alignCurrent');
  }, [extractLngLat, getCompanyCoords]);

  const alignPickedPointToCompany = useCallback(() => {
    if (!pickedPoint) return;
    const company = getCompanyCoords();
    const correction: [number, number] = [company[0] - pickedPoint[0], company[1] - pickedPoint[1]];
    setDesktopCenterCorrection(correction);
    scheduleViewportSyncRef.current('desktopCorrection:alignPicked');
  }, [getCompanyCoords, pickedPoint]);

  const batchRematchByName = useCallback(async () => {
    if (rematchRunning) return;
    const AMap = AMapRef.current;
    if (!AMap) return;

    setRematchRunning(true);
    setRematchStats(null);
    try {
      await new Promise<void>((resolve, reject) => {
        if (AMap.PlaceSearch) {
          resolve();
          return;
        }
        if (!AMap.plugin) {
          reject(new Error('当前地图实例不支持 AMap.plugin，无法加载 PlaceSearch'));
          return;
        }
        const timeout = window.setTimeout(() => reject(new Error('加载 PlaceSearch 超时')), 5000);
        AMap.plugin('AMap.PlaceSearch', () => {
          window.clearTimeout(timeout);
          resolve();
        });
      });

      if (!AMap.PlaceSearch) {
        setRematchStats({
          matched: 0,
          total: communities.length,
          unresolved: communities.map(c => c.name),
          reason: 'PlaceSearch 插件未加载成功，请检查高德 Key 安全配置与域名白名单',
        });
        return;
      }

      const placeSearch = new AMap.PlaceSearch({ city: '上海', citylimit: false });
      const nextMap = new Map(modifiedCoords);
      const unresolved: string[] = [];
      let matched = 0;

      const searchOne = (keyword: string) =>
        new Promise<[number, number] | null>((resolve) => {
          placeSearch.search(keyword, (status, result) => {
            if (status !== 'complete') {
              resolve(null);
              return;
            }
            const pois = result?.poiList?.pois ?? [];
            for (const poi of pois) {
              const loc = extractLngLat(poi.location);
              if (!loc) continue;
              resolve(loc);
              return;
            }
            resolve(null);
          });
        });

      for (const c of communities) {
        const queries = [c.name, `${c.name}小区`, `上海市杨浦区${c.name}`, `杨浦区${c.name}`];
        let found: [number, number] | null = null;
        for (const q of queries) {
          found = await searchOne(q);
          if (found) break;
        }
        if (!found) {
          unresolved.push(c.name);
          continue;
        }
        nextMap.set(c.id, { original: c.coordinates, modified: found });
        matched += 1;
      }

      setModifiedCoords(nextMap);
      if (matched > 0) setEditMode(true);
      setRematchStats({ matched, total: communities.length, unresolved });
      pushDebugSnapshotRef.current('batchRematch:done');
    } catch (err) {
      const reason = err instanceof Error ? err.message : '批量匹配失败';
      setRematchStats({
        matched: 0,
        total: communities.length,
        unresolved: communities.map(c => c.name),
        reason,
      });
    } finally {
      setRematchRunning(false);
    }
  }, [communities, extractLngLat, modifiedCoords, rematchRunning]);

  const copyDebugInfo = useCallback(async () => {
    if (!debugEnabledRef.current) return;
    const payload = {
      companyCoords: getCompanyCoords(),
      desktopCenterCorrection,
      rematchStats,
      snapshots: debugSnapshots,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setDebugCopied(true);
      setTimeout(() => setDebugCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [debugSnapshots, desktopCenterCorrection, getCompanyCoords, rematchStats]);

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
        plugins: ['AMap.Scale', 'AMap.PlaceSearch'],
      }).then((AMap: AMapApi) => {
        // 检查是否已被销毁
        if (isDestroyedRef.current || !containerRef.current) return;

        AMapRef.current = AMap;

        const initialCompanyCoords = normalizeLngLat(COMPANY_COORDS) ?? COMPANY_COORDS;

        const map = new AMap.Map(containerRef.current, {
          zoom: DEFAULT_ZOOM,
          center: initialCompanyCoords,
        });

        if (debugEnabledRef.current) {
          map.on?.('click', (e?: unknown) => {
            const anyEvent = e as { lnglat?: { lng?: number; lat?: number }; pixel?: { x?: number; y?: number } } | undefined;
            const lnglat: [number, number] | null = extractLngLat(anyEvent?.lnglat);
            const pixel =
              anyEvent?.pixel && typeof anyEvent.pixel.x === 'number' && typeof anyEvent.pixel.y === 'number'
                ? { x: anyEvent.pixel.x, y: anyEvent.pixel.y }
                : null;
            const pointer = lastPointerRef.current;
            const deltaPx =
              pixel && pointer ? { x: Math.round(pointer.container.x - pixel.x), y: Math.round(pointer.container.y - pixel.y) } : null;
            if (pickModeRef.current && lnglat) {
              setPickedPoint(lnglat);
            }
            pushDebugSnapshotRef.current('amap:click', {
              pointer: pointer ?? undefined,
              amapClick: { lnglat, pixel, deltaPx },
            });
          });
        }

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
  }, [extractLngLat, mapDisabled]);

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
    const mode = getLayoutMode();
    layoutModeRef.current = mode;
    pushDebugSnapshotRef.current(`layoutMode:init:${mode}`);
  }, [getLayoutMode, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    if (desktopCenterCorrection) return;
    if (selectedCommunity || previewCommunity) return;
    if (getLayoutMode() !== 'desktop') return;
    const map = mapRef.current;
    if (!map?.getCenter) return;
    const center = extractLngLat(map.getCenter());
    if (!center) return;
    const company = getCompanyCoords();
    const dist = calculateDistanceMeters(center, company);
    if (!Number.isFinite(dist) || dist < 200) return;
    const correction: [number, number] = [company[0] - center[0], company[1] - center[1]];
    setDesktopCenterCorrection(correction);
    pushDebugSnapshotRef.current('desktopCorrection:auto', {
      amapClick: { lnglat: center, pixel: null, deltaPx: null },
    });
    scheduleViewportSyncRef.current('desktopCorrection:auto');
  }, [desktopCenterCorrection, extractLngLat, getCompanyCoords, getLayoutMode, mapReady, previewCommunity, selectedCommunity]);

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
    const handler = () => {
      const mode = getLayoutMode();
      if (layoutModeRef.current !== mode) {
        layoutModeRef.current = mode;
        pushDebugSnapshotRef.current(`layoutMode:changed:${mode}`);
      }
    };
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }, [getLayoutMode, mapReady]);

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
  }, [extractLngLat, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const el = containerRef.current;
    if (!el) return;
    const onPointerDown = (ev: PointerEvent) => {
      const now = Date.now();
      if (now - lastInteractionSyncAtRef.current < 200) return;
      lastInteractionSyncAtRef.current = now;

      const rect = el.getBoundingClientRect();
      const pointer: DebugSnapshot['pointer'] = {
        client: { x: Math.round(ev.clientX), y: Math.round(ev.clientY) },
        container: { x: Math.round(ev.clientX - rect.left), y: Math.round(ev.clientY - rect.top) },
        rect: { left: Math.round(rect.left), top: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) },
      };
      lastPointerRef.current = pointer;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY) as Element | null;
      const hitTest: DebugSnapshot['hitTest'] | undefined = hit
        ? {
            tag: hit.tagName,
            id: hit instanceof HTMLElement ? hit.id || null : null,
            className: hit instanceof HTMLElement ? hit.className ? String(hit.className) : null : null,
            inMap: el.contains(hit),
          }
        : undefined;

      const map = mapRef.current;
      const AMap = AMapRef.current;
      const pixel = AMap?.Pixel ? new AMap.Pixel(pointer.container.x, pointer.container.y) : null;
      const inferredLngLat =
        map && pixel
          ? extractLngLat(map.containerToLngLat?.(pixel) ?? map.pixelToLngLat?.(pixel))
          : null;

      pushDebugSnapshotRef.current('pointerdown', {
        pointer,
        hitTest,
        amapClick: inferredLngLat ? { lnglat: inferredLngLat, pixel: { x: pointer.container.x, y: pointer.container.y }, deltaPx: null } : undefined,
      });
      scheduleViewportSyncRef.current('pointerdown');
    };
    const onClick = (ev: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const pointer: DebugSnapshot['pointer'] = {
        client: { x: Math.round(ev.clientX), y: Math.round(ev.clientY) },
        container: { x: Math.round(ev.clientX - rect.left), y: Math.round(ev.clientY - rect.top) },
        rect: { left: Math.round(rect.left), top: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) },
      };
      const hit = document.elementFromPoint(ev.clientX, ev.clientY) as Element | null;
      const hitTest: DebugSnapshot['hitTest'] | undefined = hit
        ? {
            tag: hit.tagName,
            id: hit instanceof HTMLElement ? hit.id || null : null,
            className: hit instanceof HTMLElement ? hit.className ? String(hit.className) : null : null,
            inMap: el.contains(hit),
          }
        : undefined;

      const map = mapRef.current;
      const AMap = AMapRef.current;
      const pixel = AMap?.Pixel ? new AMap.Pixel(pointer.container.x, pointer.container.y) : null;
      const inferredLngLat =
        map && pixel
          ? extractLngLat(map.containerToLngLat?.(pixel) ?? map.pixelToLngLat?.(pixel))
          : null;

      if (pickModeRef.current && inferredLngLat) {
        setPickedPoint(inferredLngLat);
      }

      pushDebugSnapshotRef.current('dom:click', {
        pointer,
        hitTest,
        amapClick: inferredLngLat ? { lnglat: inferredLngLat, pixel: { x: pointer.container.x, y: pointer.container.y }, deltaPx: null } : undefined,
      });
    };
    el.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    el.addEventListener('click', onClick, { capture: true, passive: true });
    return () => {
      el.removeEventListener('pointerdown', onPointerDown, { capture: true } as AddEventListenerOptions);
      el.removeEventListener('click', onClick, { capture: true } as AddEventListenerOptions);
    };
  }, [extractLngLat, mapReady]);

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
    <div
      ref={containerRef}
      className={styles.container}
      data-testid="map-root"
      data-last-click={disabledLastClick ? `${disabledLastClick.x},${disabledLastClick.y}/${disabledLastClick.w}x${disabledLastClick.h}` : undefined}
      onPointerDown={(e) => {
        if (!mapDisabled) return;
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);
        setDisabledLastClick({ x, y, w: Math.round(rect.width), h: Math.round(rect.height) });
      }}
    >
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
                        <span className={styles.debugKey}>序号/标签</span>
                        <span className={styles.debugVal}>#{debugSummary.last.seq} {debugSummary.last.label}</span>
                      </div>
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
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>DPR/平台</span>
                        <span className={styles.debugVal}>{debugSummary.last.dpr} / {debugSummary.last.platform}</span>
                      </div>
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>容器Rect</span>
                        <span className={styles.debugVal}>
                          {debugSummary.last.containerRect
                            ? `${debugSummary.last.containerRect.left},${debugSummary.last.containerRect.top},${debugSummary.last.containerRect.w}x${debugSummary.last.containerRect.h}`
                            : 'null'}
                        </span>
                      </div>
                      {debugDelta && (
                        <div className={styles.debugRow}>
                          <span className={styles.debugKey}>最近差分</span>
                          <span className={styles.debugVal}>
                            Δvw:{debugDelta.viewportW} Δvh:{debugDelta.viewportH} Δleft:{debugDelta.rectLeft} Δtop:{debugDelta.rectTop} Δw:{debugDelta.rectW} Δh:{debugDelta.rectH}
                          </span>
                        </div>
                      )}
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>桌面修正</span>
                        <span className={styles.debugVal}>
                          {desktopCenterCorrection
                            ? `Δlng:${desktopCenterCorrection[0].toFixed(6)} Δlat:${desktopCenterCorrection[1].toFixed(6)}`
                            : '未启用'}
                        </span>
                      </div>
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>修正控制</span>
                        <span className={styles.debugVal}>
                          <button
                            className={styles.debugBtn}
                            onClick={() => {
                              setDesktopCenterCorrection(DESKTOP_CENTER_CORRECTION_BASELINE);
                              scheduleViewportSyncRef.current('desktopCorrection:baseline');
                            }}
                          >
                            基线
                          </button>
                          {' '}
                          <button
                            className={styles.debugBtn}
                            onClick={() => {
                              setDesktopCenterCorrection(null);
                              scheduleViewportSyncRef.current('desktopCorrection:disabled');
                            }}
                          >
                            关闭
                          </button>
                        </span>
                      </div>
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>微调步长</span>
                        <span className={styles.debugVal}>
                          <input
                            value={nudgeStepInput}
                            onChange={(e) => setNudgeStepInput(e.target.value)}
                            placeholder="0.000100"
                            style={{ width: 120 }}
                          />
                        </span>
                      </div>
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>微调方向</span>
                        <span className={styles.debugVal}>
                          <button className={styles.debugBtn} onClick={() => adjustDesktopCorrection(-nudgeStep, 0)}>←</button>{' '}
                          <button className={styles.debugBtn} onClick={() => adjustDesktopCorrection(nudgeStep, 0)}>→</button>{' '}
                          <button className={styles.debugBtn} onClick={() => adjustDesktopCorrection(0, nudgeStep)}>↑</button>{' '}
                          <button className={styles.debugBtn} onClick={() => adjustDesktopCorrection(0, -nudgeStep)}>↓</button>
                        </span>
                      </div>
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>快速对齐</span>
                        <span className={styles.debugVal}>
                          <button className={styles.debugBtn} onClick={alignCurrentCenterToCompany}>当前中心对齐公司</button>{' '}
                          <button className={styles.debugBtn} onClick={alignPickedPointToCompany}>采点对齐公司</button>
                        </span>
                      </div>
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>批量匹配</span>
                        <span className={styles.debugVal}>
                          <button className={styles.debugBtn} onClick={batchRematchByName} disabled={rematchRunning}>
                            {rematchRunning ? '匹配中...' : '按名称重匹配'}
                          </button>
                        </span>
                      </div>
                      {rematchStats && (
                        <div className={styles.debugRow}>
                          <span className={styles.debugKey}>匹配结果</span>
                          <span className={styles.debugVal}>
                            {rematchStats.matched}/{rematchStats.total}
                            {rematchStats.unresolved.length > 0 ? `，未命中${rematchStats.unresolved.length}` : ''}
                            {rematchStats.reason ? `，原因: ${rematchStats.reason}` : ''}
                          </span>
                        </div>
                      )}
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>采点模式</span>
                        <span className={styles.debugVal}>
                          <button className={styles.debugBtn} onClick={() => setPickMode(v => !v)}>
                            {pickMode ? '关闭' : '开启'}
                          </button>
                        </span>
                      </div>
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>最后采点</span>
                        <span className={styles.debugVal}>
                          {pickedPoint ? `${pickedPoint[0].toFixed(6)}, ${pickedPoint[1].toFixed(6)}` : 'null'}
                        </span>
                      </div>
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>期望经度</span>
                        <span className={styles.debugVal}>
                          <input
                            value={expectedLngInput}
                            onChange={(e) => setExpectedLngInput(e.target.value)}
                            placeholder="121.512568"
                            style={{ width: 120 }}
                          />
                        </span>
                      </div>
                      <div className={styles.debugRow}>
                        <span className={styles.debugKey}>期望纬度</span>
                        <span className={styles.debugVal}>
                          <input
                            value={expectedLatInput}
                            onChange={(e) => setExpectedLatInput(e.target.value)}
                            placeholder="31.304715"
                            style={{ width: 120 }}
                          />
                        </span>
                      </div>
                      {calibrationResult && (
                        <>
                          <div className={styles.debugRow}>
                            <span className={styles.debugKey}>偏移量</span>
                            <span className={styles.debugVal}>
                              Δlng:{calibrationResult.deltaLng.toFixed(6)} Δlat:{calibrationResult.deltaLat.toFixed(6)}
                            </span>
                          </div>
                          <div className={styles.debugRow}>
                            <span className={styles.debugKey}>建议中心</span>
                            <span className={styles.debugVal}>
                              {calibrationResult.suggestedCenter[0].toFixed(6)}, {calibrationResult.suggestedCenter[1].toFixed(6)}
                            </span>
                          </div>
                          <div className={styles.debugRow}>
                            <span className={styles.debugKey}>应用修正</span>
                            <span className={styles.debugVal}>
                              <button
                                className={styles.debugBtn}
                                onClick={() => {
                                  setDesktopCenterCorrection([calibrationResult.deltaLng, calibrationResult.deltaLat]);
                                  scheduleViewportSyncRef.current('desktopCorrection:manual');
                                }}
                              >
                                应用到桌面修正
                              </button>
                            </span>
                          </div>
                        </>
                      )}
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
