import { NextResponse } from 'next/server';
import { db } from '@/src/db';
import { communityComments, commentStatusEnum } from '@/src/db/schema';
import { eq, desc, count } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function verifyAdmin(request: Request): boolean {
  const adminKey = request.headers.get('x-admin-key');
  return !!adminKey && adminKey === process.env.ADMIN_KEY;
}

// ---------------------------------------------------------------------------
// GET /api/admin/comments?status=pending&page=1&pageSize=20
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ message: '未授权' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status') || 'pending';
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 20));

    // Validate status param
    if (!commentStatusEnum.enumValues.includes(statusParam as typeof commentStatusEnum.enumValues[number])) {
      return NextResponse.json({ message: '无效的状态参数' }, { status: 400 });
    }

    const statusFilter = statusParam as 'pending' | 'approved' | 'rejected';

    const [comments, countResult] = await Promise.all([
      db
        .select({
          id: communityComments.id,
          communityId: communityComments.communityId,
          nickname: communityComments.nickname,
          content: communityComments.content,
          status: communityComments.status,
          createdAt: communityComments.createdAt,
        })
        .from(communityComments)
        .where(eq(communityComments.status, statusFilter))
        .orderBy(desc(communityComments.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: count() })
        .from(communityComments)
        .where(eq(communityComments.status, statusFilter)),
    ]);

    const total = countResult[0]?.total ?? 0;

    return NextResponse.json({
      comments,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器错误';
    return NextResponse.json({ message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/comments?id=xxx  { status: 'approved' | 'rejected' }
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ message: '未授权' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ message: '缺少评论 ID' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: '无效的请求体' }, { status: 400 });
    }

    const { status: newStatus } = body as Record<string, unknown>;

    if (
      typeof newStatus !== 'string' ||
      !commentStatusEnum.enumValues.includes(newStatus as typeof commentStatusEnum.enumValues[number])
    ) {
      return NextResponse.json({ message: '无效的状态' }, { status: 400 });
    }

    const result = await db
      .update(communityComments)
      .set({ status: newStatus as 'approved' | 'rejected' })
      .where(eq(communityComments.id, id))
      .returning({ id: communityComments.id });

    if (result.length === 0) {
      return NextResponse.json({ message: '评论不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: result[0].id, status: newStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器错误';
    return NextResponse.json({ message }, { status: 500 });
  }
}
