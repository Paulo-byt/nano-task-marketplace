/**
 * One-off provisioning script -- NOT part of the application runtime.
 * Drives the app's REAL SIWE sign-in flow (POST /api/auth/nonce, sign the
 * returned nonce with an ephemeral local viem account, POST
 * /api/auth/verify) to obtain genuine session cookies for k6's
 * authenticated-reads.js scenario, keyed by real distinct sessionUser.id
 * values -- never a fabricated cookie or a mocked session.
 *
 * Every wallet used here is a fresh, locally generated private key
 * (viem's generatePrivateKey()) that exists only for this run. It never
 * holds funds and never signs or submits anything on-chain -- SIWE
 * sign-in is an off-chain personal_sign, not a transaction.
 *
 * Usage:
 *   npx tsx scripts/load-test-provision-sessions.ts
 *
 * Requires the local dev server (npm run dev) already running -- this
 * script does not start it. Writes load-tests/k6/lib/sessions.local.json
 * (gitignored), consumed by load-tests/k6/scenarios/authenticated-reads.js.
 *
 * Env vars:
 *   LOAD_TEST_BASE_URL     defaults to http://localhost:3000
 *   SESSION_COUNT          defaults to 3, clamped to [1, 20]
 *   LOAD_TEST_ALLOW_REMOTE set to "1" to target a non-localhost host
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "@/lib/arc/chains";

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_SESSION_COUNT = 3;
const MAX_SESSION_COUNT = 20;

const baseUrl = (process.env.LOAD_TEST_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

// Deliberately local-only by default, matching every other testnet/local
// guard already in this codebase (lib/circle/client.ts's ARC-TESTNET-only
// constant, scripts/circle-provision-testnet-wallet.ts's hard-coded
// blockchain check): this script signs in as real (if ephemeral) users,
// so pointing it anywhere but a local dev server needs an explicit,
// deliberate opt-in, not a typo'd LOAD_TEST_BASE_URL.
const targetHost = new URL(baseUrl).hostname;
const isLocalHost = targetHost === "localhost" || targetHost === "127.0.0.1";
if (!isLocalHost && process.env.LOAD_TEST_ALLOW_REMOTE !== "1") {
  throw new Error(
    `Refusing to provision sessions against "${baseUrl}" -- this script is ` +
      "intended for a local dev server only. Set LOAD_TEST_ALLOW_REMOTE=1 " +
      "explicitly if you really mean to target a non-localhost host."
  );
}

const requestedCount = Number(process.env.SESSION_COUNT || DEFAULT_SESSION_COUNT);
const sessionCount = Number.isFinite(requestedCount)
  ? Math.min(Math.max(Math.trunc(requestedCount), 1), MAX_SESSION_COUNT)
  : DEFAULT_SESSION_COUNT;

const OUTPUT_PATH = fileURLToPath(
  new URL("../load-tests/k6/lib/sessions.local.json", import.meta.url)
);

interface ProvisionedSession {
  walletAddress: string;
  sessionCookie: string;
}

// Mirrors hooks/useWallet.ts's buildSignInMessage exactly -- the server
// (lib/auth/siwe.ts's validateSiweMessageFields, invoked from
// app/api/auth/verify/route.ts) checks the message's own domain/URI/
// chain-ID lines against the real request's host and origin. This must
// match byte-for-byte what a real browser sign-in would send for this
// same baseUrl -- NOT lib/auth/siwe.ts's own buildSiweMessage helper,
// which hardcodes "https://" and is not what the client actually sends
// (confirmed by reading both side by side; that helper isn't imported by
// either auth route).
function buildSignInMessage(
  domain: string,
  uri: string,
  address: string,
  nonce: string
): string {
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    "Sign in to Nano Task Marketplace.",
    "",
    `URI: ${uri}`,
    "Version: 1",
    `Chain ID: ${arcTestnet.id}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/session_id=([^;]+)/);
  return match ? match[1] : null;
}

async function provisionOneSession(index: number): Promise<ProvisionedSession> {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const nonceRes = await fetch(`${baseUrl}/api/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: account.address }),
  });

  if (!nonceRes.ok) {
    throw new Error(
      `[session ${index}] /api/auth/nonce failed with ${nonceRes.status}: ` +
        (await nonceRes.text().catch(() => ""))
    );
  }

  const { nonce } = (await nonceRes.json()) as { nonce: string };
  const domain = new URL(baseUrl).host;
  const message = buildSignInMessage(domain, baseUrl, account.address, nonce);
  const signature = await account.signMessage({ message });

  const verifyRes = await fetch(`${baseUrl}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });

  if (!verifyRes.ok) {
    throw new Error(
      `[session ${index}] /api/auth/verify failed with ${verifyRes.status}: ` +
        (await verifyRes.text().catch(() => ""))
    );
  }

  const sessionCookie = extractSessionCookie(verifyRes.headers.get("set-cookie"));
  if (!sessionCookie) {
    throw new Error(`[session ${index}] verify succeeded but no session_id cookie was returned.`);
  }

  return { walletAddress: account.address, sessionCookie };
}

async function main(): Promise<void> {
  console.log(`Target: ${baseUrl}`);
  console.log(`Provisioning ${sessionCount} ephemeral test session(s)...\n`);

  try {
    const preflight = await fetch(baseUrl);
    if (!preflight.ok && preflight.status >= 500) {
      throw new Error(`Server responded with ${preflight.status}`);
    }
  } catch (err) {
    throw new Error(
      `Could not reach ${baseUrl} -- is the local dev server running (npm run dev)? ` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const sessions: ProvisionedSession[] = [];
  for (let i = 1; i <= sessionCount; i++) {
    const session = await provisionOneSession(i);
    console.log(`  [${i}/${sessionCount}] ${session.walletAddress} -> session acquired`);
    sessions.push(session);
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(sessions, null, 2) + "\n", "utf8");

  console.log(`\nWrote ${sessions.length} session(s) to ${OUTPUT_PATH}`);
  console.log(
    "These are real, active sessions for ephemeral, fund-less test wallets on " +
      "the local dev database -- gitignored, never commit this file, and treat " +
      "it as sensitive for as long as it exists (it grants the same read access " +
      "as the real browser session it stands in for)."
  );
}

main().catch((err) => {
  console.error("Provisioning failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
