'use client';

import { useState } from 'react';
import type { Community } from '@/types/community';
import styles from './CommunityCard.module.css';
import CommentSection from './CommentSection';
import ImageGallery from './ImageGallery';
import ImageUploader from './ImageUploader';

type TabKey = 'info' | 'images' | 'comments';

interface CommunityCardProps {
  community: Community;
  onClose: () => void;
  isAdmin?: boolean;
}

function renderInfoTab(community: Community) {
  return (
    <>
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
        <span className={styles.contributor}>数据来源: {community.contributor || '即刻社区'}</span>
        <span className={styles.updatedAt}>更新于 {community.updatedAt || '未知'}</span>
      </div>
    </>
  );
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'info', label: '信息' },
  { key: 'images', label: '图片' },
  { key: 'comments', label: '评论' },
];

export default function CommunityCard({ community, onClose, isAdmin }: CommunityCardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [imageRefreshKey, setImageRefreshKey] = useState(0);
  const commute = community.commute;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>

        <h2 className={styles.title}>{community.name}</h2>

        <div className={styles.meta}>
          {commute ? (
            <>
              <span className={styles.distance}>📍 {commute.roadDistanceKm}km</span>
              <span className={styles.walkTime}>🚶 步行{commute.walkMinutes}min</span>
              <span className={styles.bikeTime}>🚴 骑行{commute.bikeMinutes}min</span>
            </>
          ) : (
            <>
              <span className={styles.distance}>📍 {community.distance}</span>
              <span className={styles.bikeTime}>🚴 {community.bikeTime}</span>
            </>
          )}
        </div>

        <div className={styles.price}>
          <span className={styles.priceValue}>
            {community.price.min === community.price.max
              ? Math.round(community.price.min / 1000) + 'k'
              : `${Math.round(community.price.min / 1000)}-${Math.round(community.price.max / 1000)}k`}
          </span>
          <span className={styles.priceUnit}>元/{community.price.unit}</span>
        </div>

        <div className={styles.tabBar}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.tabContent}>
          {activeTab === 'info' && renderInfoTab(community)}
          {activeTab === 'images' && (
            <div>
              <ImageUploader
                communityId={community.id}
                isAdmin={isAdmin}
                onUploadComplete={() => setImageRefreshKey(k => k + 1)}
              />
              <ImageGallery
                communityId={community.id}
                isAdmin={isAdmin}
                refreshKey={imageRefreshKey}
              />
            </div>
          )}
          {activeTab === 'comments' && <CommentSection communityId={community.id} isAdmin={isAdmin} />}
        </div>
      </div>
    </div>
  );
}
