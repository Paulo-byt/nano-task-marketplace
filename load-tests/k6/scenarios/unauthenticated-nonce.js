import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, jsonHeaders, randomHexAddress, randomPrivateIp } from '../lib/config.js';

// Proves POST /api/auth/nonce works: a fresh wallet address gets a fresh
// nonce back. Deliberately does NOT proceed to /api/auth/verify -- that
// route requires a genuine SIWE signature plus its own domain/URI/
// chain-ID checks (app/api/auth/verify/route.ts, lib/auth/siwe.ts), which
// this scenario has no way to fake and isn't trying to. See
// load-tests/README.md for the full reasoning, and
// scripts/load-test-provision-sessions.ts, which DOES complete real
// sign-ins (for authenticated-reads.js) using genuine signatures instead
// of pretending.
//
// Smoke (default): 1 VU, 3 iterations -- safe to run anytime against a
// running local dev server.
// Load (`k6 run --env LOAD=1 ...`): a short, light, opt-in profile. Not
// run automatically as part of implementing this workstream.
const SYNTHETIC_IP = randomPrivateIp();

export const options = __ENV.LOAD
  ? {
      vus: 3,
      duration: '20s',
      thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<500'],
      },
    }
  : {
      vus: 1,
      iterations: 3,
      thresholds: {
        http_req_failed: ['rate==0'],
      },
    };

export default function () {
  const res = http.post(
    `${BASE_URL}/api/auth/nonce`,
    JSON.stringify({ walletAddress: randomHexAddress() }),
    { headers: jsonHeaders({ 'X-Forwarded-For': SYNTHETIC_IP }) }
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has a non-empty nonce': (r) => {
      if (r.status !== 200) return false;
      try {
        const body = r.json();
        return typeof body.nonce === 'string' && body.nonce.length > 0;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
