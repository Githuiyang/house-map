export interface CommuteInfo {
  distanceKm: number;       // 直线距离 (km)
  roadDistanceKm: number;    // 道路距离估算 (km)
  walkMinutes: number;      // 步行时间 (分钟)
  bikeMinutes: number;      // 骑行时间 (分钟)
}

export interface Community {
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat]
  distance: string;
  bikeTime: string;
  commute?: CommuteInfo;
  price: {
    min: number;
    max: number;
    unit: string;
  };
  floorTypes?: string[];
  layouts?: string[];
  elevator?: boolean;
  highlights?: string[];
  warnings?: string[];
  contributor?: string;
  updatedAt?: string;
}

// 默认值工厂函数
export function createDefaultCommunity(partial: Partial<Community>): Community {
  return {
    id: partial.id || 'unknown',
    name: partial.name || '未知小区',
    coordinates: partial.coordinates || [0, 0],
    distance: partial.distance || '未知',
    bikeTime: partial.bikeTime || '未知',
    commute: partial.commute,
    price: {
      min: partial.price?.min ?? 0,
      max: partial.price?.max ?? 0,
      unit: partial.price?.unit || '月',
    },
    floorTypes: partial.floorTypes || [],
    layouts: partial.layouts || [],
    elevator: partial.elevator ?? false,
    highlights: partial.highlights || [],
    warnings: partial.warnings || [],
    contributor: partial.contributor || '匿名',
    updatedAt: partial.updatedAt || '未知',
  };
}

export interface CommunityComment {
  id: string;
  nickname: string;
  content: string;
  createdAt: string;
}

export interface CommunityImage {
  id: string;
  url: string;
  caption: string | null;
  uploadedAt: string;
}
