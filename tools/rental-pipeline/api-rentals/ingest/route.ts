import { NextResponse } from 'next/server';
import { ingestRentalBatch } from '@/utils/rentalStorage';
import { syncCommunitiesFromRentals } from '@/utils/communityCatalog';
import type { RentalIngestInput } from '@/types/rental';

export const runtime = 'nodejs';

interface IngestRequestBody {
  lines?: string[];
  items?: RentalIngestInput[];
  reporter?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as IngestRequestBody;
    const items = Array.isArray(body.items)
      ? body.items
      : (body.lines || []).map(rawText => ({
          rawText,
          source: 'openclaw' as const,
          reporter: body.reporter,
          capturedAt: new Date().toISOString(),
        }));

    const normalized = items.map(item => ({
      source: 'openclaw' as const,
      capturedAt: new Date().toISOString(),
      ...item,
    })).filter(item => item.rawText?.trim());

    if (!normalized.length) {
      return NextResponse.json({ message: '缺少可处理的租房文本' }, { status: 400 });
    }

    const result = await ingestRentalBatch(normalized);
    result.communitySync = await syncCommunitiesFromRentals(result.items);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '租房数据写入失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
