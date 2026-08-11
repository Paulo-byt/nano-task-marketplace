import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, jsonHeaders, randomHexAddress, randomPrivateIp } from '../lib/config.js';

// Deliberately tiny, single-VU, single-iteration: this scenario exists to
// prove the *boundary* behaves correctly, not to generate load. Targets
// POST /api/auth/nonce because it requires no authentication and has the
// lowest limit configured anywhere in lib/rateLimit.ts's RATE_LIMITS
// (authNonce: 10 requests / 5 minutes -- confirmed by reading that file
// directly, not assumed).
//
// A synthetic, per-run X-Forwarded-For isolates this run's rate-limit
// bucket from any other unauthenticated local traffic -- see
// load-tests/k6/lib/config.js's randomPrivateIp() for why that matters
// (getClientIp() otherwise buckets every unauthenticated local caller
// together under "unknown", which would make this boundary
// non-deterministic).
const SYNTHETIC_IP = randomPrivateIp();

const LIMIT = 10; // lib/rateLimit.ts RATE_LIMITS.authNonce.limit
const TOTAL_REQUESTS = LIMIT + 2; // enough to confirm the boundary twice, no more

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  let firstLimitedAt = null;

  for (let i = 1; i <= TOTAL_REQUESTS; i++) {
    const res = http.post(
      `${BASE_URL}/api/auth/nonce`,
      JSON.stringify({ walletAddress: randomHexAddress() }),
      { headers: jsonHeaders({ 'X-Forwarded-For': SYNTHETIC_IP }) }
    );

    const expectLimited = i > LIMIT;
    if (res.status === 429 && firstLimitedAt === null) {
      firstLimitedAt = i;
    }

    check(res, {
      [`request ${i}: status is ${expectLimited ? '429' : '200'} as expected`]: (r) =>
        r.status === (expectLimited ? 429 : 200),
    });

    if (expectLimited) {
      check(res, {
        [`request ${i}: Retry-After header is present`]: (r) =>
          r.headers['Retry-After'] !== undefined && r.headers['Retry-After'] !== '',
        [`request ${i}: server stayed healthy (no 5xx)`]: (r) => r.status < 500,
      });
    }
  }

  check(null, {
    [`the boundary landed exactly at request ${LIMIT + 1}`]: () => firstLimitedAt === LIMIT + 1,
  });
}
