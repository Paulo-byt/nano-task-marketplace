/**
 * One-off provisioning script -- NOT part of the application runtime.
 * Run manually, once, to create the Circle-controlled wallet used as the
 * platform treasury on ARC-TESTNET (Phase C: platform funding/pool
 * mechanics). Deliberately a separate wallet set from the executor's own
 * (scripts/circle-provision-testnet-wallet.ts) -- the treasury holds real
 * funds and authorizes the executor; it must never be the same identity
 * the executor already is, and keeping them in distinct wallet sets makes
 * that separation visible in Circle's own console, not just in code.
 *
 * Deliberately, permanently ARC-TESTNET-only, the same fail-closed guard
 * as the executor's provisioning script: the blockchain value below is a
 * hard-coded literal, never a parameter, flag, or environment variable.
 * Provisioning a production treasury is a distinct, not-yet-built,
 * separately-approved future step -- do not adapt this script to do that.
 *
 * Usage:
 *   npx tsx scripts/circle-provision-testnet-treasury-wallet.ts
 *
 * Requires CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET to already be set in
 * .env.local (a Circle sandbox/test account's credentials -- never a
 * production key). After running, copy the printed wallet id into
 * CIRCLE_TREASURY_WALLET_ID in .env.local, then run
 * syncPlatformTreasuryAddress() (taskTemplatesService.ts) once to connect
 * the platform sentinel user's walletAddress to this wallet's real
 * address -- funding refuses to proceed until that step has run.
 */
import { circleClient, CIRCLE_BLOCKCHAIN } from "@/lib/circle/client";

async function main() {
  if (CIRCLE_BLOCKCHAIN !== "ARC-TESTNET") {
    // Unreachable today (the constant has no other possible value), kept
    // as an explicit, fail-closed guard rather than trusting that fact
    // silently -- mirrors the executor provisioning script's own guard.
    throw new Error(
      `Refusing to provision a wallet on "${CIRCLE_BLOCKCHAIN}" -- this script is ARC-TESTNET-only.`
    );
  }

  console.log(`Creating a wallet set (blockchain: ${CIRCLE_BLOCKCHAIN})...`);
  const walletSet = await circleClient.createWalletSet({
    name: "nano-task-marketplace-testnet-treasury",
  });

  const walletSetId = walletSet.data?.walletSet?.id;
  if (!walletSetId) {
    throw new Error("Failed to create a wallet set -- no id in the response.");
  }
  console.log("Created wallet set:", walletSetId);

  const wallets = await circleClient.createWallets({
    blockchains: [CIRCLE_BLOCKCHAIN],
    count: 1,
    walletSetId,
  });

  const wallet = wallets.data?.wallets?.[0];
  if (!wallet) {
    throw new Error("Failed to create a wallet -- no wallet in the response.");
  }

  console.log("\nCreated ARC-TESTNET treasury wallet:");
  console.log("  id:        ", wallet.id);
  console.log("  address:   ", wallet.address);
  console.log("  blockchain:", wallet.blockchain);

  if (wallet.blockchain !== CIRCLE_BLOCKCHAIN) {
    // Should be unreachable -- checked explicitly rather than assumed,
    // matching this codebase's own "never trust one layer" convention.
    throw new Error(
      `Circle created the wallet on "${wallet.blockchain}", not "${CIRCLE_BLOCKCHAIN}" -- ` +
        "do not use this wallet id. This should be impossible; stop and investigate."
    );
  }

  console.log("\nAdd this to .env.local:");
  console.log(`CIRCLE_TREASURY_WALLET_ID=${wallet.id}`);
  console.log(
    "\nThis wallet holds no funds yet. Fund it with testnet USDC, then run " +
      "syncPlatformTreasuryAddress() once before attempting to fund any " +
      "platform template's pool."
  );
}

main().catch((err) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});
