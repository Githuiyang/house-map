'use client';

import { useMemo } from 'react';
import type { Community } from '@/types/community';
import { formatK } from '@/utils/price';
import { buildCommunityCardViewModel } from '@/utils/communityCardViewModel';
import styles from './CommunityCard.module.css';
import CommentSection from './CommentSection';
import ImageGallery from './ImageGallery';

interface CommunityCardProps {
  community: Community;
  onClose: () => void;
}

export default function CommunityCard({ community, onClose }: CommunityCardProps) {
  const vm = useMemo(() => buildCommunityCardViewModel(community), [community]);

  const hasPriceData = vm.priceRows.length > 0;
  const hasFallbackPrice = !hasPriceData && (community.price.min > 0 || community.price.max > 0);
  const hasNoPriceLayouts = vm.noPriceRows.length > 0;
  const showBadges = vm.priceBadges.length > 0 || hasFallbackPrice;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          {'\u00D7'}
        </button>

        <h2 className={styles.title}>{vm.name}</h2>

        <div className={styles.meta}>
          {vm.commuteSummary.roadDistanceKm != null ? (
            <>
              <span>{'\uD83D\uDCCD'} {vm.commuteSummary.roadDistanceKm}km</span>
              <span>{'\uD83D\uDEB6'} 步行{vm.commuteSummary.walkMinutes}min</span>
              <span>{'\uD83D\uDEB4'} 骑行{vm.commuteSummary.bikeMinutes}min</span>
            </>
          ) : (
            <>
              <span>{'\uD83D\uDCCD'} {vm.commuteSummary.distance}</span>
              <span>{'\uD83D\uDEB4'} {vm.commuteSummary.bikeTime}</span>
            </>
          )}
        </div>

        {/* 价格摘要 badges */}
        {showBadges && (
          <div className={styles.priceSummaryRow}>
            {vm.priceBadges.map((badge, i) => (
              <span key={i} className={styles.priceBadge}>
                <span className={styles.priceBadgeLabel}>{badge.label}</span>
                <span className={styles.priceValue}>{badge.price}</span>
                <span className={styles.priceUnit}>{badge.unit}</span>
              </span>
            ))}
            {hasFallbackPrice && (
              <span className={styles.priceBadge}>
                <span className={styles.priceBadgeLabel}>参考价</span>
                <span className={styles.priceValue}>
                  {community.price.min === community.price.max
                    ? formatK(community.price.min)
                    : `${formatK(community.price.min)}-${formatK(community.price.max)}`}
                </span>
                <span className={styles.priceUnit}>/月</span>
              </span>
            )}
          </div>
        )}

        {/* 价格明细表 */}
        {hasPriceData && (
          <div className={styles.pricingSection}>
            <table className={styles.pricingTable}>
              <thead>
                <tr>
                  <th>户型</th>
                  <th>面积</th>
                  <th>整租</th>
                  <th>单间估算</th>
                </tr>
              </thead>
              <tbody>
                {vm.priceRows.map((row, i) => (
                  <tr key={`${row.layout}-${i}`}>
                    <td>{row.layout}</td>
                    <td className={styles.tdSubtle}>
                      {row.area ?? '-'}
                    </td>
                    <td className={row.whole ? styles.priceHighlight : styles.priceEmpty}>
                      {row.whole ? formatK(row.whole) : '-'}
                    </td>
                    <td className={row.pricePerRoom ? styles.priceHighlight : styles.priceEmpty}>
                      {row.pricePerRoom ? formatK(row.pricePerRoom) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 已知户型暂无报价 */}
        {hasNoPriceLayouts && (
          <div className={styles.noPriceSection}>
            <span className={styles.noPriceLabel}>已知户型暂无报价</span>
            <div className={styles.noPriceTags}>
              {vm.noPriceRows.map((row, i) => (
                <span key={i} className={styles.noPriceTag}>{row.layout}</span>
              ))}
            </div>
          </div>
        )}

        {/* 数据提示 */}
        {vm.dataWarnings.length > 0 && (
          <div className={styles.dataWarnings}>
            {vm.dataWarnings.map((w, i) => (
              <span key={i} className={styles.dataWarningChip}>{'\u26A0'} {w.message}</span>
            ))}
          </div>
        )}

        <div className={styles.divider} />

        {/* 户型标签 */}
        {vm.layoutTags.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>户型</h3>
            <div className={styles.tags}>
              {vm.layoutTags.map(layout => (
                <span key={layout} className={styles.tag}>{layout}</span>
              ))}
            </div>
          </div>
        )}

        {/* 楼层/电梯 事实标签 */}
        {vm.factChips.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>楼层类型</h3>
            <div className={styles.tags}>
              {vm.factChips.map(chip => (
                <span key={chip} className={styles.tag}>{chip}</span>
              ))}
            </div>
          </div>
        )}

        {/* 优点 */}
        {vm.pros.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>优点</h3>
            <ul className={styles.list}>
              {vm.pros.map((item, i) => (
                <li key={i} className={styles.highlightItem}>{'\u2713'} {item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 注意事项 */}
        {vm.cons.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>注意事项</h3>
            <ul className={styles.list}>
              {vm.cons.map((item, i) => (
                <li key={i} className={styles.warningItem}>{'\u26A0'} {item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 备注 */}
        {vm.notes.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>备注</h3>
            <ul className={styles.list}>
              {vm.notes.map((item, i) => (
                <li key={i} className={styles.noteItem}>{'\u2139'} {item}</li>
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
          <span>数据来源: {vm.contributor}</span>
          <span>更新于 {vm.updatedAt}</span>
        </div>
      </div>
    </div>
  );
}
