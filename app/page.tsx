'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import FilterBar from '@/components/FilterBar';
import CommunityCard from '@/components/CommunityCard';
import communitiesData from '@/data/communities.json';
import type { Community } from '@/types/community';
import { normalizeCommunities } from '@/utils/communityData';
import { formatK, formatPricePerRoom } from '@/utils/price';
import styles from './page.module.css';

// 动态导入 MapView，禁用 SSR
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>地图加载中...</div>,
});

// 格式化价格显示 (简化为 k 单位)
function formatPrice(min: number, max: number): string {
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
  if (community.price.min === 0 && community.price.max === 0 && (!community.roomPricing || community.roomPricing.length === 0)) {
    return '';
  }
  const avgPerRoom = community.pricePerRoomStats?.avg;
  if (avgPerRoom) {
    return formatPricePerRoom(avgPerRoom) ?? formatPrice(community.price.min, community.price.max);
  }
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

export default function Home() {
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [previewCommunity, setPreviewCommunity] = useState<Community | null>(null);
  const [hoveredCommunity, setHoveredCommunity] = useState<Community | null>(null);
  const [distanceFilter, setDistanceFilter] = useState('2');
  const [priceFilter, setPriceFilter] = useState('all');
  const [layoutFilter, setLayoutFilter] = useState('all');
  const [rentalTypeFilter, setRentalTypeFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
  const [showMobileFilter, setShowMobileFilter] = useState(false);

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

      // 租法筛选
      if (rentalTypeFilter !== 'all' && community.roomPricing && community.roomPricing.length > 0) {
        if (rentalTypeFilter === 'shared') {
          const hasShared = community.roomPricing.some(
            rp => !rp.layout?.includes('一室') && rp.shared > 0
          );
          if (!hasShared) return false;
        } else {
          const hasWhole = community.roomPricing.some(
            rp => rp.whole > 0 || (rp.pricePerRoom != null && rp.pricePerRoom > 0)
          );
          if (!hasWhole) return false;
        }
      }

      // 价格筛选
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
            const hasMatch = community.roomPricing.some(rp => {
              if (rp.layout?.includes('一室')) return false;
              return rp.shared > 0 && rp.shared >= range.min && rp.shared <= range.max;
            });
            if (!hasMatch) return false;
          } else if (rentalTypeFilter === 'whole' && community.roomPricing && community.roomPricing.length > 0) {
            const hasMatch = community.roomPricing.some(rp => {
              const price = rp.whole || (rp.layout?.includes('一室') ? (rp.pricePerRoom || 0) : 0);
              return price > 0 && price >= range.min && price <= range.max;
            });
            if (!hasMatch) return false;
          } else {
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

  const handleRentalTypeChange = useCallback((value: string) => {
    setRentalTypeFilter(value);
    if (value === 'shared' && layoutFilter === '一室') {
      setLayoutFilter('all');
    }
  }, [layoutFilter]);

  // Render a community list item (shared between drawer and mobile)
  const renderListItem = (community: Community) => (
    <div
      key={community.id}
      className={styles.listItem}
      onClick={() => {
        handlePreviewCommunity(community);
        setDrawerOpen(false);
      }}
      onMouseEnter={() => {
        if (hoveredCommunity?.id !== community.id) setHoveredCommunity(community);
      }}
      onMouseLeave={() => {
        if (hoveredCommunity?.id === community.id) setHoveredCommunity(null);
      }}
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
  );

  return (
    <div className={styles.container}>
      {/* Navbar */}
      <nav className={styles.navbar}>
        <button
          className={styles.hamburger}
          onClick={() => setDrawerOpen(!drawerOpen)}
          aria-label="菜单"
        >
          ≡
        </button>
        <h1 className={styles.slogan}>找到你公司附近最合适的房子</h1>
        <div className={styles.navbarFilters}>
          <FilterBar
            variant="compact"
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
      </nav>

      {/* Map area */}
      <div className={styles.mapArea}>
        <MapView
          communities={filteredCommunities}
          selectedCommunity={selectedCommunity}
          previewCommunity={previewCommunity}
          hoveredCommunity={hoveredCommunity}
          onSelectCommunity={handleSelectCommunity}
          onPreviewCommunity={handlePreviewCommunity}
        />
      </div>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div
          className={styles.drawerOverlay}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Side drawer (desktop) */}
      <aside className={`${styles.drawer} ${drawerOpen ? styles.drawerOpen : ''}`}>
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>筛选 & 列表</h2>
          <button
            className={styles.drawerClose}
            onClick={() => setDrawerOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className={styles.drawerContent}>
          <FilterBar
            variant="full"
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
            {filteredCommunities.length === 0 ? (
              <p className={styles.empty}>没有符合条件的小区</p>
            ) : (
              filteredCommunities.map(renderListItem)
            )}
          </div>
        </div>
      </aside>

      {/* Mobile filter FAB */}
      <button
        className={styles.mobileFilterFab}
        onClick={() => setShowMobileFilter(true)}
        aria-label="筛选"
      >
        ⚙
      </button>

      {/* Mobile filter sheet */}
      <div
        className={`${styles.mobileFilterSheet} ${showMobileFilter ? styles.show : ''}`}
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
          <FilterBar
            variant="full"
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

      {/* Mobile bottom sheet */}
      <div
        className={`${styles.mobileBottomSheet} ${bottomSheetExpanded ? styles.mobileBottomSheetExpanded : ''}`}
        onClick={() => setBottomSheetExpanded(!bottomSheetExpanded)}
      >
        <div className={styles.mobileSheetHandle}>
          <div className={styles.mobileSheetHandleBar} />
        </div>
        <div className={styles.mobileSheetSummary}>
          {filteredCommunities.length} 个小区 · 点击{bottomSheetExpanded ? '收起' : '展开'}
        </div>
        {bottomSheetExpanded && (
          <div className={styles.mobileSheetList}>
            {filteredCommunities.map(community => (
              <div
                key={community.id}
                className={styles.listItem}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreviewCommunity(community);
                }}
              >
                <div className={styles.itemRow1}>
                  <span className={styles.itemName}>🏠 {community.name}</span>
                </div>
                <div className={styles.itemRow2}>
                  <span className={styles.itemMeta}>
                    {community.commute
                      ? `${community.commute.roadDistanceKm}km · 步行${community.commute.walkMinutes}min`
                      : `${community.distance}`}
                  </span>
                </div>
                <div className={styles.itemRow3}>
                  <span className={styles.itemMeta}>
                    {getRentalPriceText(community, rentalTypeFilter)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Community detail card */}
      {selectedCommunity && (
        <CommunityCard
          key={selectedCommunity.id}
          community={selectedCommunity}
          onClose={handleCloseCard}
        />
      )}
    </div>
  );
}
