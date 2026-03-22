export interface Community {
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat]
  distance: string;
  bikeTime: string;
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
