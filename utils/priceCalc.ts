import type { RoomPricing, PricePerRoomStats } from '@/types/community';

/**
 * 从 roomPricing 中排除一室户，重新计算单间均价统计
 * 规则：layout 包含"一室"的条目不参与计算
 */
export function calcPricePerRoomStats(
  roomPricing?: RoomPricing[]
): PricePerRoomStats | undefined {
  if (!roomPricing || roomPricing.length === 0) return undefined;

  // 排除一室一厅、一室户
  const multiRoom = roomPricing.filter(rp => !rp.layout?.includes('一室'));
  if (multiRoom.length === 0) return undefined;

  const prices = multiRoom
    .map(rp => rp.pricePerRoom)
    .filter((p): p is number => p != null && p > 0);

  if (prices.length === 0) return undefined;

  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
  };
}
