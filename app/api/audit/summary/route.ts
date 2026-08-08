import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { getAdminAuditSummary } from '@/lib/queries';

export async function GET(request: NextRequest) {
  const auth = validateApiKey(request);
  if (!auth.valid) return auth.response!;

  const range = request.nextUrl.searchParams.get('range') || 'hoy';
  const startDate = request.nextUrl.searchParams.get('startDate') || undefined;
  const endDate = request.nextUrl.searchParams.get('endDate') || undefined;
  const shiftVal = request.nextUrl.searchParams.get('turno') || undefined;
  const shiftNumber = shiftVal ? Number(shiftVal) : undefined;

  try {
    const data = await getAdminAuditSummary(range, startDate, endDate, shiftNumber);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error fetching audit summary', details: error.message },
      { status: 500 }
    );
  }
}
