import { NextResponse } from 'next/server';
import {
  generateAndPersistTrendReport,
  loadCurrentSnapshot,
  loadHistoryEvents,
  loadLatestTrendReport,
} from '@/utils/rentalStorage';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const snapshot = await loadCurrentSnapshot();
    const report = await loadLatestTrendReport();
    return NextResponse.json({ snapshot, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取趋势报告失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const snapshot = await loadCurrentSnapshot();
    const events = await loadHistoryEvents();
    const report = await generateAndPersistTrendReport(snapshot, events);
    return NextResponse.json({ snapshot, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成趋势报告失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
