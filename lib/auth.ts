import { NextRequest, NextResponse } from 'next/server';

export function validateApiKey(request: NextRequest): { valid: boolean; response?: NextResponse } {
  const allowedKeys = [
    process.env.AGENT_SECRET_KEY,
    process.env.AGENT_API_KEY,
    'cqr_agent_master_key_2026',
    'autoctona_secret_key_2026_x89a',
    'mermelada_secret_key_2026_x89a',
  ].filter(Boolean);

  const requestKey = request.headers.get('x-agent-api-key');

  if (!requestKey || !allowedKeys.includes(requestKey)) {
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
