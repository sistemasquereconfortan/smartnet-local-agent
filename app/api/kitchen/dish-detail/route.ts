import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { getChefDishDetail } from '@/lib/queries';

export async function GET(request: NextRequest) {
  const auth = validateApiKey(request);
  if (!auth.valid) return auth.response!;

  const codigo = request.nextUrl.searchParams.get('codigo');
  if (!codigo) {
    return NextResponse.json({ error: 'Missing codigo parameter' }, { status: 400 });
  }

  const range = request.nextUrl.searchParams.get('range') || 'hoy';
  const startDate = request.nextUrl.searchParams.get('startDate') || undefined;
  const endDate = request.nextUrl.searchParams.get('endDate') || undefined;

  try {
    const data = await getChefDishDetail(codigo, range, startDate, endDate);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error fetching dish detail', details: error.message },
      { status: 500 }
    );
  }
}
