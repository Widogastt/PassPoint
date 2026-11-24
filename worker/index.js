import { createRemoteJWKSet, jwtVerify } from 'jose';
export { ClassroomBoard } from './storage.js';

let jwks;
let issuer;
const fail = (message, status) => new Response(message, { status, headers: { 'Cache-Control': 'no-store' } });

async function teacher(request, env) {
  const url = new URL(request.url);
  if (env.LOCAL_TEST === 'yes' && ['localhost', '127.0.0.1'].includes(url.hostname)) return 'local-test';
  if (!env.ACCESS_ISSUER || !env.ACCESS_AUD) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  if (issuer !== env.ACCESS_ISSUER) {
    issuer = env.ACCESS_ISSUER;
    jwks = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer));
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp'] });
    return typeof payload.email === 'string' && payload.email && payload.sub;
  } catch { return null; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'POST' || request.headers.get('Upgrade')) {
      if (request.headers.get('Origin') !== url.origin) return fail('Origin mismatch.', 403);
    }
    if (path === '/' || path === '/index.html') return Response.redirect(url.origin + '/teacher');
    const staff = path === '/teacher' || path.startsWith('/api/teacher/');
    let id;
    if (staff) {
      const identity = await teacher(request, env);
      if (!identity) return fail('Teacher sign-in required. Configure Cloudflare Access for this site.', 403);
      id = env.BOARDS.idFromName(identity);
    }
    if (path === '/teacher' || path === '/door') {
      const asset = path === '/teacher' ? '/' : '/door-page';
      return env.ASSETS.fetch(new URL(asset, url));
    }
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!staff) {
      if (!path.startsWith('/api/kiosk/')) return fail('Unknown route.', 404);
      const device = request.headers.get('Cookie')?.match(/(?:^|; )pp_device=([0-9a-f]{64})\.([a-z0-9-]{36})\b/);
      const target = path === '/api/kiosk/pair' ? url.searchParams.get('board') : device?.[1];
      try { id = env.BOARDS.idFromString(target || ''); } catch { return fail('Pair this device first.', 401); }
    }
    return env.BOARDS.get(id).fetch(request);
  },
};
