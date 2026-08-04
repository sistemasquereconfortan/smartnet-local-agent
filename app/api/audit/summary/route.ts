import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { getAdminAuditSummary } from '@/lib/queries';
import cache from '@/lib/cache';

export async function GET(request: NextRequest) {
  const auth = validateApiKey(request);
  if (!auth.valid) return auth.response!;

  const cacheKey = 'admin_audit_summary';

  try {
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json({
        cached: true,
        data: cachedData,
      });
    }

    const data = await getAdminAuditSummary();
    cache.set(cacheKey, data);

    return NextResponse.json({
      cached: false,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error fetching audit summary', details: error.message },
      { status: 500 }
    );
  }
}
