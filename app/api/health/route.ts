import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db';
import { validateApiKey } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = validateApiKey(request);
  if (!auth.valid) return auth.response!;

  try {
    const start = Date.now();
    await executeQuery('SELECT 1');
    const dbLatencyMs = Date.now() - start;

    return NextResponse.json({
      status: 'ok',
      agent: 'SmartNet Local Agent (Autoctona)',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        latency_ms: dbLatencyMs,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        agent: 'SmartNet Local Agent (Autoctona)',
        timestamp: new Date().toISOString(),
        database: {
          connected: false,
          error: error.message || 'Database connection error',
        },
      },
      { status: 500 }
    );
  }
}
