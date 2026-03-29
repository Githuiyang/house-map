import type {
  RentalHistoryEvent,
  RentalListingRecord,
  RentalSystemSnapshot,
  RentalTrendPoint,
  RentalTrendReport,
} from '@/types/rental';
import { averageNumbers } from '@/utils/collections';

function dateKey(value: string): string {
  return value.slice(0, 10);
}

function calculateFreshnessScore(listings: RentalListingRecord[]): number {
  if (!listings.length) return 0;
  const now = Date.now();
  const scored = listings.map(listing => {
    const days = Math.max(0, (now - new Date(listing.lastSeenAt).getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, 1 - days / 30);
  });
  return Number((scored.reduce((sum, value) => sum + value, 0) / scored.length).toFixed(2));
}

function collectTrend(listings: RentalListingRecord[]): RentalTrendPoint[] {
  const bucket = new Map<string, RentalListingRecord[]>();
  for (const listing of listings) {
    const key = dateKey(listing.capturedAt);
    const current = bucket.get(key) || [];
    current.push(listing);
    bucket.set(key, current);
  }

  return Array.from(bucket.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => {
    const prices = items.map(item => item.parsed.price).filter((value): value is number => value !== null);
    const areas = items.map(item => item.parsed.areaSqm).filter((value): value is number => value !== null);
    return {
      date,
      avgPrice: averageNumbers(prices),
      activeListingCount: items.filter(item => item.status === 'active').length,
      avgAreaSqm: averageNumbers(areas),
    };
  });
}

function calcPriceChangeRate(trend: RentalTrendPoint[]): number | null {
  if (trend.length < 2) return null;
  const first = trend.find(item => item.avgPrice !== null)?.avgPrice;
  const last = [...trend].reverse().find(item => item.avgPrice !== null)?.avgPrice;
  if (!first || !last) return null;
  return Number((((last - first) / first) * 100).toFixed(2));
}

function detectAnomalies(snapshot: RentalSystemSnapshot) {
  const anomalies: RentalTrendReport['anomalies'] = [];
  const seen = new Set<string>();

  for (const listing of snapshot.listings) {
    if (listing.validation.errors.length > 0) {
      anomalies.push({
        type: 'missing_field',
        listingId: listing.id,
        communityId: listing.parsed.communityId,
        message: listing.validation.errors.join('；'),
      });
    }

    if (seen.has(listing.dedupeKey)) {
      anomalies.push({
        type: 'duplicate',
        listingId: listing.id,
        communityId: listing.parsed.communityId,
        message: `重复去重键 ${listing.dedupeKey}`,
      });
    } else {
      seen.add(listing.dedupeKey);
    }

    if (listing.parsed.price !== null && (listing.parsed.price < 1000 || listing.parsed.price > 30000)) {
      anomalies.push({
        type: 'price_outlier',
        listingId: listing.id,
        communityId: listing.parsed.communityId,
        message: `租金 ${listing.parsed.price} 需要人工复核`,
      });
    }
  }

  return anomalies;
}

function communityActivityScore(events: RentalHistoryEvent[], communityId: string): number {
  const recent = events.filter(event => event.communityId === communityId);
  return recent.length;
}

function demandPressure(listings: RentalListingRecord[]): number {
  if (!listings.length) return 0;
  const score = listings.reduce((sum, listing) => {
    return sum + (listing.parsed.negotiable ? 0.8 : 1) + (listing.parsed.hasKey ? 0.3 : 0) + (listing.parsed.availableFrom ? 0.2 : 0);
  }, 0);
  return Number((score / listings.length).toFixed(2));
}

export function generateTrendReport(
  snapshot: RentalSystemSnapshot,
  events: RentalHistoryEvent[]
): RentalTrendReport {
  const activeListings = snapshot.listings.filter(item => item.status === 'active');
  const prices = activeListings.map(item => item.parsed.price).filter((value): value is number => value !== null);
  const negotiableCount = activeListings.filter(item => item.parsed.negotiable).length;

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      communities: snapshot.communities.length,
      activeListings: snapshot.activeListings,
      avgPrice: averageNumbers(prices),
      negotiableRatio: activeListings.length ? Number((negotiableCount / activeListings.length).toFixed(2)) : 0,
      freshnessScore: calculateFreshnessScore(activeListings),
    },
    byCommunity: snapshot.communities.map(community => {
      const listings = activeListings.filter(item => item.parsed.communityId === community.communityId);
      const trend = collectTrend(listings);
      return {
        communityId: community.communityId,
        communityName: community.communityName,
        currentAvgPrice: community.avgPrice,
        priceChangeRate: calcPriceChangeRate(trend),
        activityScore: communityActivityScore(events, community.communityId),
        demandPressure: demandPressure(listings),
        trend,
      };
    }).sort((a, b) => (b.currentAvgPrice || 0) - (a.currentAvgPrice || 0)),
    anomalies: detectAnomalies(snapshot),
  };
}
