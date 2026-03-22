'use client';

import type { Community } from '@/types/community';
import styles from './CommunityCard.module.css';

interface CommunityCardProps {
  community: Community;
  onClose: () => void;
}

export default function CommunityCard({ community, onClose }: CommunityCardProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>

        <h2 className={styles.title}>{community.name}</h2>

        <div className={styles.meta}>
          <span className={styles.distance}>📍 {community.distance}</span>
          <span className={styles.bikeTime}>🚴 {community.bikeTime}</span>
        </div>

        <div className={styles.price}>
          <span className={styles.priceValue}>
            {community.price.min}-{community.price.max}
          </span>
          <span className={styles.priceUnit}>元/{community.price.unit}</span>
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>户型</h3>
          <div className={styles.tags}>
            {(community.layouts || []).map(layout => (
              <span key={layout} className={styles.tag}>{layout}</span>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>楼层类型</h3>
          <div className={styles.tags}>
            {(community.floorTypes || []).map(type => (
              <span key={type} className={styles.tag}>{type}</span>
            ))}
            {community.elevator && <span className={styles.tag}>有电梯</span>}
          </div>
        </div>

        {(community.highlights || []).length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>优点</h3>
            <ul className={styles.list}>
              {(community.highlights || []).map((highlight, i) => (
                <li key={i} className={styles.highlight}>✓ {highlight}</li>
              ))}
            </ul>
          </div>
        )}

        {(community.warnings || []).length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>注意事项</h3>
            <ul className={styles.list}>
              {(community.warnings || []).map((warning, i) => (
                <li key={i} className={styles.warning}>⚠ {warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.footer}>
          <span className={styles.contributor}>贡献者: {community.contributor || '匿名'}</span>
          <span className={styles.updatedAt}>更新于 {community.updatedAt || '未知'}</span>
        </div>
      </div>
    </div>
  );
}
