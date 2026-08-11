import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from '../lib/config.js';

// Populated by scripts/load-test-provision-sessions.ts, which drives the
// app's REAL SIWE nonce -> sign -> verify flow using ephemeral, locally
// generated test wallets (no funds, nothing on-chain). Never hand-edit
// this file or fabricate a session entry -- see load-tests/README.md,
// "Session requirements". The file always exists (a committed `[]`
// placeholder) so `k6 inspect` never fails on a missing file; an actual
// `k6 run` with zero sessions fails fast and clearly in the default
// function below instead.
const sessionsRaw = open('../lib/sessions.local.json');
const sessions = JSON.parse(sessionsRaw || '[]');

if (sessions.length === 0) {
  console.warn(
    'load-tests/k6/lib/sessions.local.json has no sessions. Any real run of ' +
      'this scenario will fail on its first iteration. Run: ' +
      'npx tsx scripts/load-test-provision-sessions.ts (against a running local ' +
      'dev server) first.'
  );
} else if (sessions.length === 1) {
  console.warn(
    'Only 1 session available -- this run exercises ONE authenticated user, ' +
      'not independent concurrent users, because app/api/dashboard/route.ts ' +
      '(and its 5 siblings) key their rate limit as `read:${sessionUser.id}` -- ' +
      'every VU sharing this one session shares that exact bucket. Provision ' +
      'more (SESSION_COUNT=5 npx tsx scripts/load-test-provision-sessions.ts) for ' +
      'real per-user concurrency. See load-tests/README.md, "Session requirements".'
  );
}

// Re-read directly from source, not assumed: all six of these are a plain
// GET() with no params, requiring a session_id cookie, and all six
// rate-limit as `read:${sessionUser.id}` against RATE_LIMITS.authenticatedRead
// (120 requests/minute per session) in lib/rateLimit.ts. There is no
// GET /api/tasks -- that route is POST-only (task creation); the real
// marketplace listing is the Server Component covered separately by
// marketplace-browse.js.
const READ_PATHS = [
  '/api/tasks/posted',
  '/api/applications',
  '/api/notifications',
  '/api/dashboard',
  '/api/earnings',
  '/api/profile',
];

const requestedVus = __ENV.VUS ? Number(__ENV.VUS) : sessions.length;
const vus = Math.max(1, Math.min(requestedVus || 0, sessions.length || 1));
const iterations = __ENV.ITERATIONS ? Number(__ENV.ITERATIONS) : 3;

export const options = {
  scenarios: {
    authenticated_reads: {
      executor: 'per-vu-iterations',
      vus,
      iterations,
      maxDuration: '2m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  if (sessions.length === 0) {
    throw new Error(
      'No provisioned sessions available. Run ' +
        'scripts/load-test-provision-sessions.ts against a running local dev ' +
        'server first -- see load-tests/README.md.'
    );
  }

  // __VU is 1-indexed and stable for this VU's whole run, so it always
  // maps onto the same session rather than a different random one each
  // iteration -- keeping this VU's requests consistently inside its own
  // session's rate-limit bucket.
  const session = sessions[(__VU - 1) % sessions.length];
  const headers = { Cookie: `session_id=${session.sessionCookie}` };

  for (const path of READ_PATHS) {
    const res = http.get(`${BASE_URL}${path}`, { headers });

    check(res, {
      [`${path}: status is 200`]: (r) => r.status === 200,
      [`${path}: not rejected as unauthenticated`]: (r) => r.status !== 401,
    });
  }

  sleep(1);
}
