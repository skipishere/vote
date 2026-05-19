export interface Env {
  TURN_TOKEN_ID: string;
  TURN_API_TOKEN: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_TOKEN_ID}/credentials/generate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.TURN_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: 86400 }),
        }
      );

      if (!res.ok) {
        return new Response('Failed to generate credentials', { status: 502, headers: CORS_HEADERS });
      }

      const data = await res.text();
      return new Response(data, {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response('Internal Server Error', { status: 500, headers: CORS_HEADERS });
    }
  },
};
