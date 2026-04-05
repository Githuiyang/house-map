'use client';

import styles from './FilterBar.module.css';

interface FilterBarProps {
  distanceFilter: string;
  priceFilter: string;
  layoutFilter: string;
  rentalTypeFilter: string;
  onDistanceChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onLayoutChange: (value: string) => void;
  onRentalTypeChange: (value: string) => void;
  pricingAvailable?: boolean;
}

export default function FilterBar({
  distanceFilter,
  priceFilter,
  layoutFilter,
  rentalTypeFilter,
  onDistanceChange,
  onPriceChange,
  onLayoutChange,
  onRentalTypeChange,
  pricingAvailable = false,
}: FilterBarProps) {
  return (
    <div className={styles.container}>
      <div className={styles.filterGroup}>
        <label className={styles.label} htmlFor="filter-distance">距离</label>
        <select
          id="filter-distance"
          value={distanceFilter}
          onChange={(e) => onDistanceChange(e.target.value)}
          className={styles.select}
        >
          <option value="all">全部</option>
          <option value="1">1km内</option>
          <option value="2">2km内</option>
          <option value="3">3km内</option>
        </select>
      </div>

      {pricingAvailable && (
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="filter-price">租金</label>
          <select
            id="filter-price"
            value={priceFilter}
            onChange={(e) => onPriceChange(e.target.value)}
            className={styles.select}
          >
            <option value="all">全部</option>
            <option value="3000">3k以下</option>
            <option value="5000">3-5k</option>
            <option value="8000">5-8k</option>
            <option value="8001">8k以上</option>
          </select>
        </div>
      )}

      {pricingAvailable && (
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="filter-rental-type">租法</label>
          <select
            id="filter-rental-type"
            value={rentalTypeFilter}
            onChange={(e) => onRentalTypeChange(e.target.value)}
            className={styles.select}
          >
            <option value="all">全部</option>
            <option value="shared">合租</option>
            <option value="whole">整租</option>
          </select>
        </div>
      )}

      {pricingAvailable && (
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="filter-layout">户型</label>
          <select
            id="filter-layout"
            value={layoutFilter}
            onChange={(e) => onLayoutChange(e.target.value)}
            className={styles.select}
          >
            <option value="all">全部</option>
            <option value="一室">一室</option>
            <option value="两室">两室</option>
            <option value="三室">三室</option>
          </select>
        </div>
      )}
    </div>
  );
}
