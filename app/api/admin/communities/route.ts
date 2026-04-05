import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function verifyAdmin(request: Request): boolean {
  const adminKey = request.headers.get('x-admin-key');
  return !!adminKey && adminKey === process.env.ADMIN_KEY;
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/communities  { updates: [{ id, coordinates }] }
// ---------------------------------------------------------------------------

interface CommunityEntry {
  id: string;
  coordinates: [number, number];
  [key: string]: unknown;
}

export async function PATCH(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ message: '未授权' }, { status: 401 });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: '无效的请求体' }, { status: 400 });
    }

    const { updates } = body as Record<string, unknown>;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ message: '缺少 updates 数组' }, { status: 400 });
    }

    // Validate each update
    for (const update of updates) {
      const u = update as Record<string, unknown>;
      if (typeof u.id !== 'string' || !Array.isArray(u.coordinates) || u.coordinates.length !== 2) {
        return NextResponse.json({ message: `无效的更新项: ${JSON.stringify(u)}` }, { status: 400 });
      }
    }

    const filePath = resolve(process.cwd(), 'data/communities.json');
    const raw = readFileSync(filePath, 'utf-8');
    const communities: CommunityEntry[] = JSON.parse(raw);

    const indexMap = new Map<string, number>();
    communities.forEach((c, i) => indexMap.set(c.id, i));

    let updatedCount = 0;
    for (const update of updates) {
      const { id, coordinates } = update as { id: string; coordinates: [number, number] };
      const idx = indexMap.get(id);
      if (idx !== undefined) {
        communities[idx].coordinates = coordinates;
        updatedCount++;
      }
    }

    writeFileSync(filePath, JSON.stringify(communities, null, 2) + '\n', 'utf-8');

    // Git commit & push to trigger Vercel redeploy
    try {
      execSync('git add data/communities.json', { cwd: process.cwd() });
      execSync(`git commit -m "fix: 更新 ${updatedCount} 个小区坐标"`, { cwd: process.cwd() });
      execSync('git push', { cwd: process.cwd() });
    } catch (gitError) {
      const msg = gitError instanceof Error ? gitError.message : String(gitError);
      console.error('Git 操作失败:', msg);
      return NextResponse.json({
        success: true,
        warning: '文件已更新但 git push 失败，请手动推送',
        updatedCount,
      });
    }

    return NextResponse.json({ success: true, updatedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器错误';
    return NextResponse.json({ message }, { status: 500 });
  }
}
