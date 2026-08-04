import { NextRequest, NextResponse } from 'next/server';

export function validateApiKey(request: NextRequest): { valid: boolean; response?: NextResponse } {
  const secretKey = process.env.AGENT_SECRET_KEY || 'autoctona_secret_key_2026_x89a';
  const requestKey = request.headers.get('x-agent-api-key');

  if (!requestKey || requestKey !== secretKey) {
    return {
      valid: false,
      response: NextResponse.json(
        { error: 'Unauthorized: Invalid or missing x-agent-api-key header' },
        { status: 401 }
      ),
    };
  }

  return { valid: true };
}
