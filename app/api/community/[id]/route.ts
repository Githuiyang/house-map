import { NextResponse } from 'next/server';
import { db } from '@/src/db';
import { communityComments, communityImages } from '@/src/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import communitiesData from '@/data/communities.json';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pre-computed set of valid community IDs for O(1) lookups. */
const VALID_COMMUNITY_IDS = new Set<string>(communitiesData.map((c) => c.id));

// ---------------------------------------------------------------------------
// GET /api/community/[id] — fetch community detail (comments + images)
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: communityId } = await params;

    // ---- Validate communityId ----
    if (!communityId || !VALID_COMMUNITY_IDS.has(communityId)) {
      return NextResponse.json(
        { message: '未知的小区' },
        { status: 404 },
      );
    }

    // ---- Pagination ----
    const url = new URL(_request.url);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get('pageSize')) || 20),
    );

    // ---- Query comments (paginated) ----
    const comments = await db
      .select({
        id: communityComments.id,
        nickname: communityComments.nickname,
        content: communityComments.content,
        createdAt: communityComments.createdAt,
      })
      .from(communityComments)
      .where(and(
        eq(communityComments.communityId, communityId),
        eq(communityComments.status, 'approved'),
      ))
      .orderBy(desc(communityComments.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // ---- Query images (no pagination) ----
    const images = await db
      .select({
        id: communityImages.id,
        url: communityImages.url,
        caption: communityImages.caption,
        uploadedAt: communityImages.uploadedAt,
      })
      .from(communityImages)
      .where(eq(communityImages.communityId, communityId))
      .orderBy(desc(communityImages.uploadedAt));

    // ---- Get total comment count ----
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(communityComments)
      .where(and(
        eq(communityComments.communityId, communityId),
        eq(communityComments.status, 'approved'),
      ));

    const commentCount = countResult[0]?.count ?? 0;
    const hasMore = page * pageSize < commentCount;

    return NextResponse.json({
      comments,
      images,
      commentCount,
      imageCount: images.length,
      page,
      pageSize,
      hasMore,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '服务器错误';
    return NextResponse.json({ message }, { status: 500 });
  }
}
