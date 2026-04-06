import { NextResponse } from 'next/server';
import { loadFeedbackEntries, submitRentalFeedback } from '@/utils/rentalStorage';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const items = await loadFeedbackEntries();
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取反馈失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      rating: number;
      message: string;
      listingId?: string;
      communityId?: string;
      contact?: string;
    };

    if (!body.message?.trim()) {
      return NextResponse.json({ message: '反馈内容不能为空' }, { status: 400 });
    }

    const item = await submitRentalFeedback({
      rating: Math.max(1, Math.min(5, Number(body.rating) || 5)),
      message: body.message.trim(),
      listingId: body.listingId,
      communityId: body.communityId,
      contact: body.contact?.trim(),
    });
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : '写入反馈失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
