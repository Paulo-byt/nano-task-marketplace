import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from '../lib/config.js';

// Optional scenario: exercises the real marketplace Server Component page
// (app/marketplace/page.tsx), which calls getTasks() directly against the
// database and is marked `export const dynamic = "force-dynamic"` -- every
// hit is a real, live DB read, never a cached response. There is no
// GET /api/tasks; inventing one would test an endpoint that doesn't exist.
// Public and unauthenticated -- read directly from source, this page
// applies no rate limiting at all, unlike every route the other three
// scenarios in this directory hit. That makes this the one scenario here
// that says nothing about rate-limiting behavior; it exists purely to
// prove the actual page real users load stays responsive under light load.
//
// Smoke (default): 1 VU, 1 iteration.
// Load (`k6 run --env LOAD=1 ...`): a short, light, opt-in profile. Not
// run automatically as part of implementing this workstream.
export const options = __ENV.LOAD
  ? {
      vus: 5,
      duration: '30s',
      thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<1000'],
      },
    }
  : {
      vus: 1,
      iterations: 1,
      thresholds: {
        http_req_failed: ['rate==0'],
      },
    };

export default function () {
  const res = http.get(`${BASE_URL}/marketplace`);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'looks like the marketplace page': (r) =>
      typeof r.body === 'string' && r.body.includes('Marketplace'),
  });

  sleep(1);
}
