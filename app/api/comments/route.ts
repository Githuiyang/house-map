import { NextResponse } from 'next/server';
import { db } from '@/src/db';
import { communityComments } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { VALID_COMMUNITY_IDS, getClientIp } from '@/src/lib/api-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic-ish hex hash from an IP string (no crypto import). */
function hashIp(ip: string): string {
  return ip
    .split('')
    .reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0)
    .toString(16)
    .replace('-', '0');
}

/** Generate a short unique ID without external deps. */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------------------------------------------------------------------------
// In-memory rate limiter (per IP, 60-second cooldown)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 60_000;
const lastCommentAt = new Map<string, number>();

// ---------------------------------------------------------------------------
// POST /api/comments — create a comment
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    // ---- Parse body ----
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: '无效的请求体' }, { status: 400 });
    }

    const { communityId, nickname, content } = body as Record<string, unknown>;

    // ---- Validate content ----
    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ message: '评论内容不能为空' }, { status: 400 });
    }
    if (content.length > 500) {
      return NextResponse.json({ message: '评论内容不能超过500个字符' }, { status: 400 });
    }

    // ---- Validate nickname ----
    let safeNickname = '匿名';
    if (nickname !== undefined && nickname !== null) {
      if (typeof nickname !== 'string' || nickname.length > 20) {
        return NextResponse.json({ message: '昵称不能超过20个字符' }, { status: 400 });
      }
      safeNickname = nickname.trim() || '匿名';
    }

    // ---- Validate communityId ----
    if (typeof communityId !== 'string' || !communityId) {
      return NextResponse.json({ message: '缺少 communityId' }, { status: 400 });
    }
    if (!VALID_COMMUNITY_IDS.has(communityId)) {
      return NextResponse.json({ message: '未知的小区' }, { status: 404 });
    }

    // ---- Rate limit ----
    const ip = getClientIp(request);
    const ipHash = hashIp(ip);
    const now = Date.now();
    const lastTime = lastCommentAt.get(ip) ?? 0;
    if (now - lastTime < RATE_LIMIT_MS) {
      return NextResponse.json(
        { message: '评论太频繁，请稍后再试' },
        { status: 429 },
      );
    }
    lastCommentAt.set(ip, now);

    // ---- Build record ----
    const id = generateId();
    const trimmedContent = content.trim();
    const createdAt = new Date();

    await db.insert(communityComments).values({
      id,
      communityId,
      nickname: safeNickname,
      content: trimmedContent,
      ipHash,
      createdAt,
    });

    return NextResponse.json(
      { id, nickname: safeNickname, content: trimmedContent, createdAt, status: 'pending', message: '评论已提交，等待审核' },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器错误';
    return NextResponse.json({ message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/comments?id=xxx — delete a comment
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ message: '缺少评论 ID' }, { status: 400 });
    }

    // ---- Find the comment ----
    const [comment] = await db
      .select()
      .from(communityComments)
      .where(eq(communityComments.id, id));

    if (!comment) {
      return NextResponse.json({ message: '评论不存在' }, { status: 404 });
    }

    // ---- Auth check ----
    const adminKey = request.headers.get('x-admin-key');
    const isAdmin = adminKey && adminKey === process.env.ADMIN_KEY;

    if (!isAdmin) {
      // Non-admin: can only delete own comment within 10 minutes
      const ip = getClientIp(request);
      const ipHash = hashIp(ip);
      const elapsed = Date.now() - comment.createdAt.getTime();

      if (ipHash !== comment.ipHash || elapsed > 10 * 60_000) {
        return NextResponse.json({ message: '无权删除此评论' }, { status: 403 });
      }
    }

    // ---- Delete ----
    await db
      .delete(communityComments)
      .where(eq(communityComments.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器错误';
    return NextResponse.json({ message }, { status: 500 });
  }
}
