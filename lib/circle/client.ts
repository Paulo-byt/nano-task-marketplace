import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

// Hard runtime guard, matching the existing convention in lib/ai/client.ts
// and lib/arc/executor.ts: this module derives a client from server-only
// secrets and must never execute in a browser.
if (typeof window !== "undefined") {
  throw new Error(
    "lib/circle/client.ts must never run in a browser -- it derives the " +
      "server-only Circle client from CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET."
  );
}

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

if (!apiKey) {
  throw new Error(
    "CIRCLE_API_KEY is not set. Add it to .env.local (server-only, never committed)."
  );
}

if (!entitySecret) {
  throw new Error(
    "CIRCLE_ENTITY_SECRET is not set. Add it to .env.local (server-only, never " +
      "committed). Generate one with the installed SDK's generateEntitySecretCiphertext " +
      "helper and register it once via registerEntitySecretCiphertext before first use " +
      "(see Circle's Developer-Controlled Wallets onboarding docs)."
  );
}

/**
 * Verified against the installed @circle-fin/developer-controlled-wallets
 * package (dist/types/developer-controlled-wallets.d.ts), not assumed:
 * initiateDeveloperControlledWalletsClient({ apiKey, entitySecret, baseUrl? }).
 */
export const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey,
  entitySecret,
});

/**
 * Phase 10 Workstream A is deliberately ARC-TESTNET-only. Verified present
 * in the SDK's own EvmBlockchain enum (EvmBlockchain.ArcTestnet ===
 * "ARC-TESTNET"). This is a plain constant, not derived from any
 * environment variable or flag -- there is no code path anywhere in this
 * module, or anything that imports it, that can select ARC mainnet
 * ("ARC"). Production support is a distinct, not-yet-built, separately
 * approved future step; do not add a flag here that could select it.
 */
export const CIRCLE_BLOCKCHAIN = "ARC-TESTNET" as const;
