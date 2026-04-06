'use client';

import styles from './FilterBar.module.css';

interface FilterBarProps {
  variant?: 'compact' | 'full';
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

const DISTANCE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: '1', label: '1km' },
  { value: '2', label: '2km' },
  { value: '3', label: '3km' },
];

const PRICE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: '3000', label: '≤3K' },
  { value: '5000', label: '3-5K' },
  { value: '8000', label: '5-8K' },
  { value: '8001', label: '≥8K' },
];

const RENTAL_TYPE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'shared', label: '合租' },
  { value: 'whole', label: '整租' },
];

const LAYOUT_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: '一室', label: '一室' },
  { value: '两室', label: '两室' },
  { value: '三室', label: '三室' },
];

function ButtonGroup({
  options,
  current,
  onChange,
}: {
  options: { value: string; label: string }[];
  current: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.buttonGroup}>
      {options.map(opt => (
        <button
          key={opt.value}
          className={`${styles.filterBtn} ${current === opt.value ? styles.filterBtnActive : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function FilterBar({
  variant = 'full',
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
  const isCompact = variant === 'compact';

  return (
    <div className={`${styles.container} ${isCompact ? styles.compact : ''}`}>
      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>距离</span>
        <ButtonGroup
          options={DISTANCE_OPTIONS}
          current={distanceFilter}
          onChange={onDistanceChange}
        />
      </div>

      {pricingAvailable && (
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>价格</span>
          <ButtonGroup
            options={PRICE_OPTIONS}
            current={priceFilter}
            onChange={onPriceChange}
          />
        </div>
      )}

      {!isCompact && pricingAvailable && (
        <>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>租法</span>
            <ButtonGroup
              options={RENTAL_TYPE_OPTIONS}
              current={rentalTypeFilter}
              onChange={onRentalTypeChange}
            />
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>户型</span>
            <ButtonGroup
              options={
                rentalTypeFilter === 'shared'
                  ? LAYOUT_OPTIONS.filter(o => o.value !== '一室')
                  : LAYOUT_OPTIONS
              }
              current={layoutFilter}
              onChange={onLayoutChange}
            />
          </div>
        </>
      )}
    </div>
  );
}
