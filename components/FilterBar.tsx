'use client';

import styles from './FilterBar.module.css';

interface FilterBarProps {
  distanceFilter: string;
  priceFilter: string;
  layoutFilter: string;
  onDistanceChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onLayoutChange: (value: string) => void;
}

export default function FilterBar({
  distanceFilter,
  priceFilter,
  layoutFilter,
  onDistanceChange,
  onPriceChange,
  onLayoutChange,
}: FilterBarProps) {
  return (
    <div className={styles.container}>
      <div className={styles.filterGroup}>
        <label className={styles.label}>距离</label>
        <select
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

      <div className={styles.filterGroup}>
        <label className={styles.label}>租金</label>
        <select
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

      <div className={styles.filterGroup}>
        <label className={styles.label}>户型</label>
        <select
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
    </div>
  );
}
