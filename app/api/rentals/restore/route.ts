import { NextResponse } from 'next/server';
import { restoreLatestBackup } from '@/utils/rentalStorage';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const snapshot = await restoreLatestBackup();
    if (!snapshot) {
      return NextResponse.json({ message: '暂无可恢复备份' }, { status: 404 });
    }
    return NextResponse.json({ snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : '恢复备份失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
