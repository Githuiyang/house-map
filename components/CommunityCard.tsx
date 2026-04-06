'use client';

import { useState } from 'react';
import type { Community, RoomPricing } from '@/types/community';
import { formatK } from '@/utils/price';
import styles from './CommunityCard.module.css';
import CommentSection from './CommentSection';
import ImageGallery from './ImageGallery';

type RentalMode = 'shared' | 'whole';

const isOneRoom = (layout: string) => layout?.includes('一室');

interface CommunityCardProps {
  community: Community;
  onClose: () => void;
}

export default function CommunityCard({ community, onClose }: CommunityCardProps) {
  const commute = community.commute;

  const hasMultiRoomShared = community.roomPricing?.some(
    rp => !isOneRoom(rp.layout) && rp.shared > 0
  );
  const [rentalMode, setRentalMode] = useState<RentalMode>(
    hasMultiRoomShared ? 'shared' : 'whole'
  );

  const hasRoomPricing =
    community.roomPricing &&
    community.roomPricing.length > 0 &&
    community.roomPricing.some(rp => rp.shared > 0 || rp.whole > 0 || (rp.pricePerRoom ?? 0) > 0);

  const displayedPricing = rentalMode === 'shared'
    ? community.roomPricing!.filter(rp => !isOneRoom(rp.layout))
    : community.roomPricing!;

  const getDisplayPrice = (rp: RoomPricing): number => {
    if (rentalMode === 'shared') return rp.shared;
    return rp.whole || (isOneRoom(rp.layout) ? (rp.pricePerRoom || 0) : 0);
  };

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
                {displayedPricing.map(rp => {
                  const price = getDisplayPrice(rp);
                  return (
                    <tr key={rp.layout}>
                      <td>{rp.layout}</td>
                      <td className={price > 0 ? styles.priceHighlight : styles.priceEmpty}>
                        {price > 0 ? formatK(price) : '暂无'}
                      </td>
                    </tr>
                  );
                })}
                {displayedPricing.length === 0 && (
                  <tr>
                    <td colSpan={2} className={styles.priceEmpty}>
                      暂无合租数据
                    </td>
                  </tr>
                )}
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

        <div className={styles.divider} />

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

        <div className={styles.divider} />

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>图片</h3>
          <ImageGallery communityId={community.id} />
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>评论</h3>
          <CommentSection communityId={community.id} />
        </div>

        <div className={styles.footer}>
          <span>数据来源: {community.contributor || '即刻社区'}</span>
          <span>更新于 {community.updatedAt || '未知'}</span>
        </div>
      </div>
    </div>
  );
}
