'use client';

import { useState } from 'react';
import type { Community } from '@/types/community';
import styles from './CommunityCard.module.css';
import CommentSection from './CommentSection';
import ImageGallery from './ImageGallery';
import ImageUploader from './ImageUploader';

type TabKey = 'info' | 'images' | 'comments';
type RentalMode = 'shared' | 'whole';

interface CommunityCardProps {
  community: Community;
  onClose: () => void;
  isAdmin?: boolean;
}

function formatK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
}

function renderInfoTab(community: Community) {
  return (
    <>
      {(community.layouts || []).length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>户型</h3>
          <div className={styles.tags}>
            {(community.layouts || []).map(layout => (
              <span key={layout} className={styles.tag}>{layout}</span>
            ))}
          </div>
        </div>
      )}

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
            {(community.highlights || []).map((item, i) => (
              <li key={i} className={styles.highlightItem}>{'\u2713'} {item}</li>
            ))}
          </ul>
        </div>
      )}

      {(community.warnings || []).length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>注意事项</h3>
          <ul className={styles.list}>
            {(community.warnings || []).map((item, i) => (
              <li key={i} className={styles.warningItem}>{'\u26A0'} {item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.footer}>
        <span>数据来源: {community.contributor || '即刻社区'}</span>
        <span>更新于 {community.updatedAt || '未知'}</span>
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
  const [rentalMode, setRentalMode] = useState<RentalMode>('shared');
  const commute = community.commute;

  const hasRoomPricing =
    community.roomPricing &&
    community.roomPricing.length > 0 &&
    community.roomPricing.some(rp => rp.shared > 0 || rp.whole > 0);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          {'\u00D7'}
        </button>

        <h2 className={styles.title}>{community.name}</h2>

        <div className={styles.meta}>
          {commute ? (
            <>
              <span>{'\uD83D\uDCCD'} {commute.roadDistanceKm}km</span>
              <span>{'\uD83D\uDEB6'} 步行{commute.walkMinutes}min</span>
              <span>{'\uD83D\uDEB4'} 骑行{commute.bikeMinutes}min</span>
            </>
          ) : (
            <>
              <span>{'\uD83D\uDCCD'} {community.distance}</span>
              <span>{'\uD83D\uDEB4'} {community.bikeTime}</span>
            </>
          )}
        </div>

        {hasRoomPricing ? (
          <div className={styles.pricingSection}>
            <div className={styles.rentalToggle}>
              <button
                className={`${styles.rentalToggleBtn} ${rentalMode === 'shared' ? styles.rentalToggleActive : ''}`}
                onClick={() => setRentalMode('shared')}
              >
                合租
              </button>
              <button
                className={`${styles.rentalToggleBtn} ${rentalMode === 'whole' ? styles.rentalToggleActive : ''}`}
                onClick={() => setRentalMode('whole')}
              >
                整租
              </button>
            </div>
            <table className={styles.pricingTable}>
              <thead>
                <tr>
                  <th>户型</th>
                  <th>价格（元/月）</th>
                </tr>
              </thead>
              <tbody>
                {community.roomPricing!.map(rp => {
                  const price = rentalMode === 'shared' ? rp.shared : rp.whole;
                  return (
                    <tr key={rp.layout}>
                      <td>{rp.layout}</td>
                      <td className={price > 0 ? styles.priceHighlight : styles.priceEmpty}>
                        {price > 0 ? formatK(price) : '暂无'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : community.price.min > 0 || community.price.max > 0 ? (
          <div className={styles.price}>
            <span className={styles.priceValue}>
              {community.price.min === community.price.max
                ? formatK(community.price.min)
                : `${formatK(community.price.min)}-${formatK(community.price.max)}`}
            </span>
            <span className={styles.priceUnit}>元/{community.price.unit}</span>
          </div>
        ) : null}

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
          {activeTab === 'comments' && (
            <CommentSection communityId={community.id} isAdmin={isAdmin} />
          )}
        </div>
      </div>
    </div>
  );
}
