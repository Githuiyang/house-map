'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import FilterBar from '@/components/FilterBar';
import CommunityCard from '@/components/CommunityCard';
import ThemeToggle from '@/components/ThemeToggle';
import communitiesData from '@/data/communities.json';
import type { Community } from '@/types/community';
import { normalizeCommunities } from '@/utils/communityData';
import { formatPricePerRoom } from '@/utils/price';
import styles from './page.module.css';

// 动态导入 MapView，禁用 SSR
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>地图加载中...</div>,
});

// 格式化价格显示 (简化为 k 单位)
function formatPrice(min: number, max: number): string {
  const formatK = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
  if (min === max) return formatK(min);
  return `${formatK(min)}-${formatK(max)}`;
}

// 获取电梯显示文本
function getElevatorText(elevator?: boolean): string {
  if (elevator === true) return '有电梯';
  if (elevator === false) return '无电梯';
  return '';
}

// 根据租法类型获取列表价格显示文本
function getRentalPriceText(
  community: Community,
  rentalType: string
): string {
  // 价格已下线时返回空
  if (community.price.min === 0 && community.price.max === 0 && (!community.roomPricing || community.roomPricing.length === 0)) {
    return '';
  }
  // 优先使用单间均价
  const avgPerRoom = community.pricePerRoomStats?.avg;
  if (avgPerRoom) {
    return formatPricePerRoom(avgPerRoom) ?? formatPrice(community.price.min, community.price.max);
  }
  // fallback: 原有逻辑
  if (rentalType === 'all' || !community.roomPricing || community.roomPricing.length === 0) {
    return formatPrice(community.price.min, community.price.max);
  }
  const priceKey = rentalType === 'shared' ? 'shared' : 'whole';
  const prices = community.roomPricing
    .map(rp => rp[priceKey])
    .filter(p => p > 0);
  if (prices.length === 0) {
    return formatPrice(community.price.min, community.price.max);
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return formatPrice(min, max);
}

// 获取户型显示文本 (取前2个)
function getLayoutsText(layouts?: string[]): string {
  if (!layouts || layouts.length === 0) return '';
  return layouts.slice(0, 2).join('/');
}

export default function Home() {
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [previewCommunity, setPreviewCommunity] = useState<Community | null>(null);
  const [hoveredCommunity, setHoveredCommunity] = useState<Community | null>(null);
  const [distanceFilter, setDistanceFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [layoutFilter, setLayoutFilter] = useState('all');
  const [rentalTypeFilter, setRentalTypeFilter] = useState('all');
  const [showMobileFilter, setShowMobileFilter] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // 管理员身份检测：sessionStorage > URL ?admin=XXX
  useEffect(() => {
    // 1. 先检查 sessionStorage 缓存
    if (sessionStorage.getItem('office-map-admin') === '1') {
      setIsAdmin(true);
      return;
    }

    // 2. 检查 URL 参数 ?admin=XXX
    const params = new URLSearchParams(window.location.search);
    const adminKey = params.get('admin');

    if (adminKey) {
      // 清除 URL 中的 admin 参数（防止 key 泄露）
      params.delete('admin');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
      window.history.replaceState({}, '', newUrl);

      // 调用服务端验证
      fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: adminKey }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.valid) {
            sessionStorage.setItem('office-map-admin-key', adminKey);
            sessionStorage.setItem('office-map-admin', '1');
            setIsAdmin(true);
          }
        })
        .catch(() => {
          // 静默忽略错误
        });
    }
  }, []);

  // 规范化数据
  const communities = useMemo(() => normalizeCommunities(communitiesData), []);

  // 判断是否有价格数据（控制筛选栏显示）
  const pricingAvailable = useMemo(() =>
    communities.some(c => c.price.min > 0 || c.price.max > 0 ||
      (c.roomPricing && c.roomPricing.some(rp => rp.shared > 0 || rp.whole > 0))),
    [communities]
  );

  // 筛选逻辑
  const filteredCommunities = useMemo(() => {
    return communities.filter(community => {
      // 隐藏没有价格数据的小区
      const hasPrice = community.price.min > 0 || community.price.max > 0 ||
        (community.roomPricing && community.roomPricing.some(rp => rp.shared > 0 || rp.whole > 0 || (rp.pricePerRoom ?? 0) > 0));
      if (!hasPrice) return false;

      // 距离筛选：使用计算的道路距离
      if (distanceFilter !== 'all') {
        const distance = community.commute?.roadDistanceKm;
        if (distance === undefined || distance > parseFloat(distanceFilter)) return false;
      }

      // 租法筛选（独立于价格筛选）
      if (rentalTypeFilter !== 'all' && community.roomPricing && community.roomPricing.length > 0) {
        if (rentalTypeFilter === 'shared') {
          // 合租：仅看多室户型的 shared 价格
          const hasShared = community.roomPricing.some(
            rp => !rp.layout?.includes('一室') && rp.shared > 0
          );
          if (!hasShared) return false;
        } else {
          // 整租：看所有户型的 whole 或 pricePerRoom
          const hasWhole = community.roomPricing.some(
            rp => rp.whole > 0 || (rp.pricePerRoom != null && rp.pricePerRoom > 0)
          );
          if (!hasWhole) return false;
        }
      }

      // 价格筛选（根据租法类型选择价格范围）
      if (priceFilter !== 'all') {
        const priceRanges: Record<string, { min: number; max: number }> = {
          '3000': { min: 0, max: 3000 },
          '5000': { min: 3000, max: 5000 },
          '8000': { min: 5000, max: 8000 },
          '8001': { min: 8000, max: Infinity },
        };
        const range = priceRanges[priceFilter];
        if (range) {
          if (rentalTypeFilter === 'shared' && community.roomPricing && community.roomPricing.length > 0) {
            // 合租：仅匹配多室户型的 shared 价格
            const hasMatch = community.roomPricing.some(rp => {
              if (rp.layout?.includes('一室')) return false;
              return rp.shared > 0 && rp.shared >= range.min && rp.shared <= range.max;
            });
            if (!hasMatch) return false;
          } else if (rentalTypeFilter === 'whole' && community.roomPricing && community.roomPricing.length > 0) {
            // 整租：匹配 whole 或 pricePerRoom（一室户用 pricePerRoom）
            const hasMatch = community.roomPricing.some(rp => {
              const price = rp.whole || (rp.layout?.includes('一室') ? (rp.pricePerRoom || 0) : 0);
              return price > 0 && price >= range.min && price <= range.max;
            });
            if (!hasMatch) return false;
          } else {
            // 全部租法：使用概览价格
            const hasOverlap = community.price.min <= range.max && community.price.max >= range.min;
            if (!hasOverlap) return false;
          }
        }
      }

      // 户型筛选
      if (layoutFilter !== 'all') {
        const layouts = community.layouts || [];
        if (!layouts.includes(layoutFilter)) return false;
      }

      return true;
    });
  }, [communities, distanceFilter, priceFilter, layoutFilter, rentalTypeFilter]);

  const handleSelectCommunity = useCallback((community: Community | null) => {
    setSelectedCommunity(community);
    if (community) setPreviewCommunity(community);
  }, []);

  const handlePreviewCommunity = useCallback((community: Community | null) => {
    setPreviewCommunity(community);
    setSelectedCommunity(null);
  }, []);

  const handleCloseCard = useCallback(() => {
    setSelectedCommunity(null);
  }, []);

  // 合租和一室户不兼容，切换到合租时自动重置户型筛选
  const handleRentalTypeChange = useCallback((value: string) => {
    setRentalTypeFilter(value);
    if (value === 'shared' && layoutFilter === '一室') {
      setLayoutFilter('all');
    }
  }, [layoutFilter]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>公司附近租房地图</h1>
        <p className={styles.subtitle}>新同事租房参考 · {filteredCommunities.length} 个小区</p>
        <ThemeToggle />
      </header>

      <main className={styles.main}>
        <aside className={styles.sidebar}>
          <FilterBar
            distanceFilter={distanceFilter}
            priceFilter={priceFilter}
            layoutFilter={layoutFilter}
            rentalTypeFilter={rentalTypeFilter}
            onDistanceChange={setDistanceFilter}
            onPriceChange={setPriceFilter}
            onLayoutChange={setLayoutFilter}
            onRentalTypeChange={handleRentalTypeChange}
            pricingAvailable={pricingAvailable}
          />

          <div className={styles.list}>
            <h2 className={styles.listTitle}>小区列表</h2>
            {filteredCommunities.length === 0 ? (
              <p className={styles.empty}>没有符合条件的小区</p>
            ) : (
              filteredCommunities.map(community => (
                <div
                  key={community.id}
                  className={styles.listItem}
                  onClick={() => handlePreviewCommunity(community)}
                  onMouseEnter={() => setHoveredCommunity(community)}
                  onMouseLeave={() => setHoveredCommunity(null)}
                >
                  <div className={styles.itemRow1}>
                    <span className={styles.itemName}>🏠 {community.name}</span>
                  </div>
                  <div className={styles.itemRow2}>
                    <span className={styles.itemMeta}>
                      {community.commute
                        ? `${community.commute.roadDistanceKm}km · 步行${community.commute.walkMinutes}min · 骑行${community.commute.bikeMinutes}min`
                        : `${community.distance} · 骑行${community.bikeTime}`}
                    </span>
                  </div>
                  <div className={styles.itemRow3}>
                    <span className={styles.itemMeta}>
                      {getRentalPriceText(community, rentalTypeFilter)}
                      {getElevatorText(community.elevator) && ` · ${getElevatorText(community.elevator)}`}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <div className={styles.mapContainer}>
          <MapView
            communities={filteredCommunities}
            selectedCommunity={selectedCommunity}
            previewCommunity={previewCommunity}
            hoveredCommunity={hoveredCommunity}
            onSelectCommunity={handleSelectCommunity}
            onPreviewCommunity={handlePreviewCommunity}
            isAdmin={isAdmin}
          />
        </div>
      </main>

      {/* 移动端筛选按钮 */}
      <button
        className={`${styles.mobileFilterBtn} ${showMobileFilter ? styles.active : ''}`}
        onClick={() => setShowMobileFilter(!showMobileFilter)}
        aria-label="筛选"
      >
        {showMobileFilter ? '✕' : '⚙'}
      </button>

      {/* 移动端筛选面板 */}
      <div
        className={`${styles.mobileFilterPanel} ${showMobileFilter ? styles.show : ''}`}
        onClick={() => setShowMobileFilter(false)}
      >
        <div
          className={styles.mobileFilterContent}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.mobileFilterHeader}>
            <h3 className={styles.mobileFilterTitle}>筛选条件</h3>
            <button
              className={styles.mobileFilterClose}
              onClick={() => setShowMobileFilter(false)}
            >
              ✕
            </button>
          </div>
          <div className={styles.mobileFilterBody}>
            <FilterBar
              distanceFilter={distanceFilter}
              priceFilter={priceFilter}
              layoutFilter={layoutFilter}
              rentalTypeFilter={rentalTypeFilter}
              onDistanceChange={setDistanceFilter}
              onPriceChange={setPriceFilter}
              onLayoutChange={setLayoutFilter}
              onRentalTypeChange={handleRentalTypeChange}
              pricingAvailable={pricingAvailable}
            />
          </div>
        </div>
      </div>

      {selectedCommunity && (
        <CommunityCard
          key={selectedCommunity.id}
          community={selectedCommunity}
          onClose={handleCloseCard}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
