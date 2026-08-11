import type { Address } from "viem";
import { circleClient, CIRCLE_BLOCKCHAIN } from "@/lib/circle/client";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/circle/executorWallet.ts must never run in a browser -- it resolves " +
      "the server-only Circle-controlled executor wallet."
  );
}

/**
 * Set once, after running scripts/circle-provision-testnet-wallet.ts and
 * copying its printed wallet id here. Runtime code never creates a wallet
 * on its own -- provisioning is a deliberate, one-off, manually-run action,
 * kept out of the request path entirely.
 */
export function getCircleExecutorWalletId(): string {
  const walletId = process.env.CIRCLE_EXECUTOR_WALLET_ID;
  if (!walletId) {
    throw new Error(
      "CIRCLE_EXECUTOR_WALLET_ID is not set. Run " +
        "scripts/circle-provision-testnet-wallet.ts once and add the printed " +
        "wallet id to .env.local."
    );
  }
  return walletId;
}

let cachedAddress: Address | null = null;

/**
 * Resolves the already-provisioned Circle-controlled wallet's on-chain
 * address -- the address creators grant their USDC allowance to, and the
 * address that submits the payout transferFrom, when
 * PAYOUT_CUSTODY_MODE=circle. Verifies the wallet is genuinely scoped to
 * ARC-TESTNET before ever using it, refusing to proceed otherwise. Cached
 * in-memory after the first successful lookup (the address never changes
 * for a given wallet id); a fresh process re-resolves it once.
 */
export async function getCircleExecutorAddress(): Promise<Address> {
  if (cachedAddress) {
    return cachedAddress;
  }

  const walletId = getCircleExecutorWalletId();
  const response = await circleClient.getWallet({ id: walletId });
  const wallet = response.data?.wallet;

  if (!wallet) {
    throw new Error(`Circle wallet ${walletId} could not be found.`);
  }

  if (wallet.blockchain !== CIRCLE_BLOCKCHAIN) {
    throw new Error(
      `Circle wallet ${walletId} is on blockchain "${wallet.blockchain}", not ` +
        `"${CIRCLE_BLOCKCHAIN}" -- refusing to use it as the testnet executor.`
    );
  }

  cachedAddress = wallet.address as Address;
  return cachedAddress;
}
