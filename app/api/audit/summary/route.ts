import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { getAdminAuditSummary } from '@/lib/queries';

export async function GET(request: NextRequest) {
  const auth = validateApiKey(request);
  if (!auth.valid) return auth.response!;

  try {
    const data = await getAdminAuditSummary();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error fetching audit summary', details: error.message },
      { status: 500 }
    );
  }
}
