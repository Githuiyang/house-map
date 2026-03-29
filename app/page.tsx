'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import FilterBar from '@/components/FilterBar';
import CommunityCard from '@/components/CommunityCard';
import ThemeToggle from '@/components/ThemeToggle';
import communitiesData from '@/data/communities.json';
import { createDefaultCommunity, type Community } from '@/types/community';
import styles from './page.module.css';

// 动态导入 MapView，禁用 SSR
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>地图加载中...</div>,
});

// 将原始数据转换为安全的 Community 对象
function normalizeCommunities(data: unknown): Community[] {
  if (!Array.isArray(data)) return [];

  return data.map(item => createDefaultCommunity({
    id: item.id,
    name: item.name,
    coordinates: item.coordinates,
    distance: item.distance,
    bikeTime: item.bikeTime,
    price: item.price,
    floorTypes: item.floorTypes,
    layouts: item.layouts,
    elevator: item.elevator,
    highlights: item.highlights,
    warnings: item.warnings,
    contributor: item.contributor,
    updatedAt: item.updatedAt,
  }));
}

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
  const [showMobileFilter, setShowMobileFilter] = useState(false);

  // 规范化数据
  const communities = useMemo(() => normalizeCommunities(communitiesData), []);

  // 筛选逻辑
  const filteredCommunities = useMemo(() => {
    return communities.filter(community => {
      // 距离筛选（简化版，实际应该计算真实距离）
      if (distanceFilter !== 'all') {
        const distance = parseFloat(community.distance);
        if (isNaN(distance) || distance > parseInt(distanceFilter)) return false;
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
          // 检查小区价格区间是否与筛选区间有交集
          const hasOverlap = community.price.min <= range.max && community.price.max >= range.min;
          if (!hasOverlap) return false;
        }
      }

      // 户型筛选
      if (layoutFilter !== 'all') {
        const layouts = community.layouts || [];
        if (!layouts.includes(layoutFilter)) return false;
      }

      return true;
    });
  }, [communities, distanceFilter, priceFilter, layoutFilter]);

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
            onDistanceChange={setDistanceFilter}
            onPriceChange={setPriceFilter}
            onLayoutChange={setLayoutFilter}
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
                    <span className={styles.itemMeta}>{community.distance} · 骑行{community.bikeTime}</span>
                  </div>
                  <div className={styles.itemRow3}>
                    <span className={styles.itemMeta}>
                      {formatPrice(community.price.min, community.price.max)}
                      {getElevatorText(community.elevator) && ` · ${getElevatorText(community.elevator)}`}
                      {getLayoutsText(community.layouts) && ` · ${getLayoutsText(community.layouts)}`}
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
              onDistanceChange={setDistanceFilter}
              onPriceChange={setPriceFilter}
              onLayoutChange={setLayoutFilter}
            />
          </div>
        </div>
      </div>

      {selectedCommunity && (
        <CommunityCard
          community={selectedCommunity}
          onClose={handleCloseCard}
        />
      )}
    </div>
  );
}
