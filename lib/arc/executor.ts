import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";

// Hard runtime guard: this module derives a real signing key from a
// server-only secret and must never execute in a browser. Belt-and-suspenders
// alongside the fact that ARC_EXECUTOR_PRIVATE_KEY (no NEXT_PUBLIC_ prefix)
// is never inlined into a client bundle by Next.js in the first place, and
// alongside the codebase convention already established by lib/auth/session.ts
// and lib/auth/siwe.ts: this file is only ever imported from app/api/*
// Route Handlers, never from a component or hook.
if (typeof window !== "undefined") {
  throw new Error(
    "lib/arc/executor.ts must never run in a browser -- it derives the " +
      "server-only executor account from ARC_EXECUTOR_PRIVATE_KEY."
  );
}

const rawKey = process.env.ARC_EXECUTOR_PRIVATE_KEY;

if (!rawKey) {
  throw new Error(
    "ARC_EXECUTOR_PRIVATE_KEY is not set. Add it to .env.local (server-only, never committed)."
  );
}

/**
 * The executor is a delegated spender, not a custodian: it never receives,
 * holds, or controls creator or worker funds at any point. It only ever
 * exercises an allowance a creator has already, explicitly, granted
 * on-chain for one specific task's exact reward amount -- see the Phase 7
 * plan, Section 3, for the full reasoning and its limits.
 *
 * This key is a security-critical secret. Whoever holds it can spend any
 * currently-outstanding allowance, up to whatever amount was approved, for
 * as long as that approval stands -- "non-custodial" describes the funds,
 * not the risk of holding this key.
 *
 * Phase 7 testnet/prototype mechanism only: the key lives in plain
 * server-only environment configuration. The intended hardening path for
 * real funds is Circle Developer-Controlled Wallets
 * (@circle-fin/developer-controlled-wallets, already installed, not yet
 * wired in), which would replace this raw key with professionally managed
 * custody rather than an application-held secret.
 */
export const executorAccount = privateKeyToAccount(rawKey as `0x${string}`);

export const EXECUTOR_ADDRESS: Address = executorAccount.address;
