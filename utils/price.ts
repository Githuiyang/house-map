/** 格式化价格为 k 单位 (e.g. 3500 → "4k", 800 → "800") */
export function formatK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
}

/**
 * 格式化单间均价
 * 有数据时返回 "单间均价 ¥Xk/月"，否则返回 null
 */
export function formatPricePerRoom(avgPerRoom: number | undefined): string | null {
  if (avgPerRoom == null) return null;
  return avgPerRoom >= 1000
    ? `单间均价 ¥${Math.round(avgPerRoom / 1000)}k/月`
    : `单间均价 ¥${avgPerRoom}/月`;
}
