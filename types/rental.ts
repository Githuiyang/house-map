export type RentalSource = 'openclaw' | 'manual' | 'api';

export interface RentalIngestInput {
  rawText: string;
  source?: RentalSource;
  externalId?: string;
  capturedAt?: string;
  reporter?: string;
}

export interface RentalParsedFields {
  communityName: string;
  communityId: string;
  price: number | null;
  areaSqm: number | null;
  layout: string | null;
  rooms: number;
  halls: number;
  bathrooms: number;
  orientation: string[];
  decoration: string | null;
  floorInfo: string | null;
  locationHints: string[];
  amenities: string[];
  tags: string[];
  availableFrom: string | null;
  negotiable: boolean;
  hasKey: boolean;
  parkingIncluded: boolean;
  elevator: boolean | null;
}

export interface RentalVectorDocument {
  dense: number[];
  sparse: Record<string, number>;
  keywords: string[];
  searchableText: string;
}

export interface RentalValidationResult {
  isValid: boolean;
  completeness: number;
  errors: string[];
  warnings: string[];
}

export interface RentalListingRecord {
  id: string;
  dedupeKey: string;
  source: RentalSource;
  externalId?: string;
  rawText: string;
  parsed: RentalParsedFields;
  vector: RentalVectorDocument;
  validation: RentalValidationResult;
  reporter?: string;
  capturedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  version: number;
  status: 'active' | 'inactive';
}

export interface RentalCommunitySnapshot {
  communityId: string;
  communityName: string;
  listingIds: string[];
  activeListingCount: number;
  latestCapturedAt: string;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  avgAreaSqm: number | null;
  layoutMix: Record<string, number>;
  tags: string[];
  amenities: string[];
}

export interface RentalSystemSnapshot {
  updatedAt: string;
  totalListings: number;
  activeListings: number;
  listings: RentalListingRecord[];
  communities: RentalCommunitySnapshot[];
}

export interface RentalHistoryEvent {
  id: string;
  type: 'ingest' | 'merge' | 'restore';
  listingId?: string;
  dedupeKey?: string;
  communityId?: string;
  timestamp: string;
  detail: Record<string, unknown>;
}

export interface RentalTrendPoint {
  date: string;
  avgPrice: number | null;
  activeListingCount: number;
  avgAreaSqm: number | null;
}

export interface RentalTrendReport {
  generatedAt: string;
  totals: {
    communities: number;
    activeListings: number;
    avgPrice: number | null;
    negotiableRatio: number;
    freshnessScore: number;
  };
  byCommunity: Array<{
    communityId: string;
    communityName: string;
    currentAvgPrice: number | null;
    priceChangeRate: number | null;
    activityScore: number;
    demandPressure: number;
    trend: RentalTrendPoint[];
  }>;
  anomalies: Array<{
    type: 'missing_field' | 'duplicate' | 'price_outlier';
    listingId: string;
    communityId: string;
    message: string;
  }>;
}

export interface RentalFeedbackEntry {
  id: string;
  createdAt: string;
  rating: number;
  message: string;
  listingId?: string;
  communityId?: string;
  contact?: string;
}

export interface RentalCommunitySyncItem {
  communityId: string;
  communityName: string;
  action: 'created' | 'updated' | 'skipped';
  geocoded: boolean;
  message: string;
}

export interface RentalCommunitySyncResult {
  created: number;
  updated: number;
  skipped: number;
  geocoded: number;
  items: RentalCommunitySyncItem[];
}

export interface RentalIngestResult {
  snapshot: RentalSystemSnapshot;
  report: RentalTrendReport;
  processed: number;
  inserted: number;
  merged: number;
  invalid: number;
  items: RentalListingRecord[];
  communitySync?: RentalCommunitySyncResult;
}
