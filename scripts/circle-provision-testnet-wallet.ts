/**
 * One-off provisioning script -- NOT part of the application runtime.
 * Run manually, once, to create the Circle-controlled wallet used as the
 * ARC-TESTNET payout executor when PAYOUT_CUSTODY_MODE=circle.
 *
 * Deliberately, permanently ARC-TESTNET-only: the blockchain value below
 * is a hard-coded literal, not a parameter, flag, or environment variable.
 * There is no argument to this script that can select ARC mainnet.
 * Provisioning a production wallet is a distinct, not-yet-built,
 * separately-approved future step -- do not adapt this script to do that.
 *
 * Usage:
 *   npx tsx scripts/circle-provision-testnet-wallet.ts
 *
 * Requires CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET to already be set in
 * .env.local (a Circle sandbox/test account's credentials -- never a
 * production key). After running, copy the printed wallet id into
 * CIRCLE_EXECUTOR_WALLET_ID in .env.local.
 */
import { circleClient, CIRCLE_BLOCKCHAIN } from "@/lib/circle/client";

async function main() {
  if (CIRCLE_BLOCKCHAIN !== "ARC-TESTNET") {
    // Unreachable today (the constant has no other possible value), kept
    // as an explicit, fail-closed guard rather than trusting that fact
    // silently -- if this module is ever changed to add a mainnet option,
    // this script must not follow it without a deliberate, separate edit.
    throw new Error(
      `Refusing to provision a wallet on "${CIRCLE_BLOCKCHAIN}" -- this script is ARC-TESTNET-only.`
    );
  }

  console.log(`Creating a wallet set (blockchain: ${CIRCLE_BLOCKCHAIN})...`);
  const walletSet = await circleClient.createWalletSet({
    name: "nano-task-marketplace-testnet-executor",
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

  console.log("\nCreated ARC-TESTNET wallet:");
  console.log("  id:        ", wallet.id);
  console.log("  address:   ", wallet.address);
  console.log("  blockchain:", wallet.blockchain);

  if (wallet.blockchain !== CIRCLE_BLOCKCHAIN) {
    // Should be unreachable -- Circle created the wallet with the exact
    // blockchain value this script requested -- but checked explicitly
    // rather than assumed, matching this codebase's own "never trust one
    // layer" convention.
    throw new Error(
      `Circle created the wallet on "${wallet.blockchain}", not "${CIRCLE_BLOCKCHAIN}" -- ` +
        "do not use this wallet id. This should be impossible; stop and investigate."
    );
  }

  console.log("\nAdd this to .env.local:");
  console.log(`CIRCLE_EXECUTOR_WALLET_ID=${wallet.id}`);
  console.log(
    "\nThe task creator's approve() must target the address above, not the " +
      "raw-key executor's address, once PAYOUT_CUSTODY_MODE=circle is selected."
  );
}

main().catch((err) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});
