import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { communityImages } from '@/src/db/schema';
import { simpleHash, getClientIp } from '@/src/lib/api-utils';

export const runtime = 'nodejs';

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { message: 'id is required' },
        { status: 400 }
      );
    }

    // Find the image
    const rows = await db
      .select()
      .from(communityImages)
      .where(eq(communityImages.id, id));

    if (rows.length === 0) {
      return NextResponse.json(
        { message: 'Image not found' },
        { status: 404 }
      );
    }

    const image = rows[0];

    // Auth check: admin key or IP match + <10 min
    const adminKey = request.headers.get('x-admin-key');
    const isAdmin = adminKey && adminKey === process.env.ADMIN_KEY;

    const clientIp = getClientIp(request);
    const ipHash = simpleHash(clientIp);
    const isOwner =
      image.uploaderIpHash === ipHash &&
      Date.now() - image.uploadedAt.getTime() < 10 * 60 * 1000; // 10 minutes

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { message: 'Not authorized to delete this image' },
        { status: 403 }
      );
    }

    // Delete from DB
    await db.delete(communityImages).where(eq(communityImages.id, id));

    // Delete from Vercel Blob (best-effort, don't fail if this errors)
    try {
      await del(image.url);
    } catch (blobError) {
      console.error('Blob deletion failed (non-fatal):', blobError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Image delete error:', error);
    const message = error instanceof Error ? error.message : 'Delete failed';
    return NextResponse.json({ message }, { status: 500 });
  }
}
