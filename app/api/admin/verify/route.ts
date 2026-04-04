import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { key } = await request.json();

    if (typeof key !== 'string' || !key) {
      return NextResponse.json({ valid: false });
    }

    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey) {
      return NextResponse.json({ valid: false });
    }

    const valid = key === adminKey;
    return NextResponse.json({ valid });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
