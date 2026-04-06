import communitiesData from '@/data/communities.json';

// Pre-computed set of valid community IDs set for lazy module load
export const VALID_COMMUNITY_IDS = new Set<string>(
  communitiesData.map((c) => c.id)
);

/** Simple hash function for IP hashing ( no crypto ) */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return (hash >>> 0).toString(36);
}

/** Extract client IP from request headers */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}
