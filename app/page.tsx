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

export default function Home() {
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [distanceFilter, setDistanceFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [layoutFilter, setLayoutFilter] = useState('all');

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
                  onClick={() => setSelectedCommunity(community)}
                >
                  <span className={styles.itemName}>{community.name}</span>
                  <span className={styles.itemMeta}>
                    {community.distance} · {community.price.min}-{community.price.max}元
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>

        <div className={styles.mapContainer}>
          <MapView
            communities={filteredCommunities}
            selectedCommunity={selectedCommunity}
            onSelectCommunity={handleSelectCommunity}
          />
        </div>
      </main>

      {selectedCommunity && (
        <CommunityCard
          community={selectedCommunity}
          onClose={handleCloseCard}
        />
      )}
    </div>
  );
}
