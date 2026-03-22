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
  floorTypes: string[];
  layouts: string[];
  elevator: boolean;
  highlights: string[];
  warnings: string[];
  contributor: string;
  updatedAt: string;
}
