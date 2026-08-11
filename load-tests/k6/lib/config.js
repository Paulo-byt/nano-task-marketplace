// Shared helpers for Workstream C's k6 scenarios.
//
// k6 scripts run in k6's own JS runtime (goja), not Node.js -- they cannot
// import this project's actual TypeScript/Next.js modules. Everything
// below is a small, deliberately duplicated reimplementation of just what
// each scenario needs; each function notes the real source it must stay
// consistent with.

// Defaults to the local dev server. Override per run with:
//   k6 run --env BASE_URL=http://localhost:3000 <script>
// Never hardcode a deployed/production URL here -- no production
// deployment exists for this project (see docs/DEPLOYMENT.md), and these
// scenarios have only ever been written and reasoned about against local
// dev server behavior.
export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

export function jsonHeaders(extra) {
  return Object.assign({ 'Content-Type': 'application/json' }, extra || {});
}

// A syntactically valid but not-a-real-wallet hex address. Its only job is
// to give POST /api/auth/nonce a unique walletAddress per call, since that
// route upserts a `users` row per address it sees (see
// services/users/walletUser.ts's getOrCreateUserByWallet). Never used to
// sign anything or touch the blockchain.
export function randomHexAddress() {
  const hex = '0123456789abcdef';
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    out += hex[Math.floor(Math.random() * hex.length)];
  }
  return out;
}

// A synthetic, private-range IP for the X-Forwarded-For header.
// lib/rateLimit.ts's getClientIp() only trusts a proxy-supplied
// X-Forwarded-For/X-Real-IP header and otherwise falls back to a single
// shared "unknown" bucket -- meaning, unmodified, EVERY unauthenticated
// caller against a local dev server (this script, any other scenario run,
// a developer manually testing sign-in in a browser tab) would collide on
// the exact same rate-limit key. Setting this mirrors what a real
// upstream proxy would supply, giving each scenario run its own isolated,
// deterministic bucket. It is never used to fake identity or bypass any
// authenticated check -- only unauthenticated, IP-keyed routes read it.
export function randomPrivateIp() {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.77.${octet()}.${octet()}`;
}
