import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { getChefDishPopularity } from '@/lib/queries';
import cache from '@/lib/cache';

export async function GET(request: NextRequest) {
  const auth = validateApiKey(request);
  if (!auth.valid) return auth.response!;

  const cacheKey = 'chef_dish_popularity';

  try {
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return NextResponse.json({
        cached: true,
        data: cachedData,
      });
    }

    const data = await getChefDishPopularity();
    cache.set(cacheKey, data);

    return NextResponse.json({
      cached: false,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error fetching dish popularity', details: error.message },
      { status: 500 }
    );
  }
}
