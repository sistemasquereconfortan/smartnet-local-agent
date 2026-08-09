import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { getFloorCaptainStatus } from '@/lib/queries';

export async function GET(request: NextRequest) {
  const auth = validateApiKey(request);
  if (!auth.valid) return auth.response!;

  try {
    const range = request.nextUrl.searchParams.get('range') || 'hoy';
    const startDate = request.nextUrl.searchParams.get('startDate') || undefined;
    const endDate = request.nextUrl.searchParams.get('endDate') || undefined;
    const data = await getFloorCaptainStatus(range, startDate, endDate);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error fetching floor captain status', details: error.message },
      { status: 500 }
    );
  }
}
