import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { db } from '@/src/db';
import { communityImages } from '@/src/db/schema';
import communitiesData from '@/data/communities.json';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const VALID_COMMUNITY_IDS = new Set(communitiesData.map((c) => c.id));

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return (hash >>> 0).toString(36);
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}

export async function POST(request: Request) {
  try {
    // ---- Auth check: only admins can upload ----
    const adminKey = request.headers.get('x-admin-key');
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { message: 'Content-Type must be multipart/form-data' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const communityId = formData.get('communityId');
    const caption = formData.get('caption');

    // Validate file
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { message: 'file is required' },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { message: 'Unsupported file type. Allowed: JPEG, PNG, WebP' },
        { status: 415 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { message: 'File too large. Maximum size is 5MB' },
        { status: 413 }
      );
    }

    // Validate communityId
    if (!communityId || typeof communityId !== 'string') {
      return NextResponse.json(
        { message: 'communityId is required' },
        { status: 400 }
      );
    }

    if (!VALID_COMMUNITY_IDS.has(communityId)) {
      return NextResponse.json(
        { message: 'Unknown community' },
        { status: 404 }
      );
    }

    // Validate caption
    if (caption !== null && typeof caption === 'string' && caption.length > 200) {
      return NextResponse.json(
        { message: 'Caption must be at most 200 characters' },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob
    const blob = await put(
      `communities/${communityId}/${Date.now()}-${file.name}`,
      file,
      { access: 'public' }
    );

    // Generate ID
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    // Get IP hash
    const clientIp = getClientIp(request);
    const ipHash = simpleHash(clientIp);

    // Insert into DB
    const now = new Date();
    await db.insert(communityImages).values({
      id,
      communityId,
      url: blob.url,
      caption: (caption as string) || null,
      uploaderIpHash: ipHash,
      uploadedAt: now,
    });

    return NextResponse.json(
      {
        id,
        url: blob.url,
        caption: caption || null,
        uploadedAt: now.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Image upload error:', error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ message }, { status: 500 });
  }
}
