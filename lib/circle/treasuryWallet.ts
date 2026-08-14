import type { Address } from "viem";
import { circleClient, CIRCLE_BLOCKCHAIN } from "@/lib/circle/client";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/circle/treasuryWallet.ts must never run in a browser -- it resolves " +
      "the server-only Circle-controlled platform treasury wallet."
  );
}

/**
 * Phase C: the platform treasury, deliberately Circle-only -- unlike the
 * executor (lib/arc/executor.ts), which supports a raw-key mode as its
 * proven, already-tested default, the treasury holds real value rather
 * than merely spending a bounded, revocable allowance. There is no
 * "raw-key treasury" mode and none should be added: a wallet whose entire
 * purpose is holding funds is exactly the case executor.ts's own comment
 * already names Circle Developer-Controlled Wallets as the intended
 * hardening path for.
 *
 * Set once, after running
 * scripts/circle-provision-testnet-treasury-wallet.ts and copying its
 * printed wallet id here -- the same one-off, manually-run provisioning
 * discipline getCircleExecutorWalletId already establishes. Runtime code
 * never creates this wallet on its own.
 */
export function getCircleTreasuryWalletId(): string {
  const walletId = process.env.CIRCLE_TREASURY_WALLET_ID;
  if (!walletId) {
    throw new Error(
      "CIRCLE_TREASURY_WALLET_ID is not set. Run " +
        "scripts/circle-provision-testnet-treasury-wallet.ts once and add the " +
        "printed wallet id to .env.local."
    );
  }
  return walletId;
}

let cachedAddress: Address | null = null;

/**
 * Resolves the already-provisioned Circle-controlled treasury wallet's
 * on-chain address -- the address that submits approve(executor, amount)
 * to fund a platform template's pool, and the address whose balance and
 * allowance preflightPayout ultimately checks before every platform-funded
 * payout, once the platform sentinel user's walletAddress is synced to it
 * (see taskTemplatesService.ts's syncPlatformTreasuryAddress).
 *
 * Mirrors getCircleExecutorAddress exactly: verifies the wallet is
 * genuinely scoped to ARC-TESTNET before ever using it, refusing
 * otherwise, and caches the address in-memory after the first successful
 * lookup (it never changes for a given wallet id).
 */
export async function getTreasuryAddress(): Promise<Address> {
  if (cachedAddress) {
    return cachedAddress;
  }

  const walletId = getCircleTreasuryWalletId();
  const response = await circleClient.getWallet({ id: walletId });
  const wallet = response.data?.wallet;

  if (!wallet) {
    throw new Error(`Circle wallet ${walletId} could not be found.`);
  }

  if (wallet.blockchain !== CIRCLE_BLOCKCHAIN) {
    throw new Error(
      `Circle wallet ${walletId} is on blockchain "${wallet.blockchain}", not ` +
        `"${CIRCLE_BLOCKCHAIN}" -- refusing to use it as the testnet treasury.`
    );
  }

  cachedAddress = wallet.address as Address;
  return cachedAddress;
}
