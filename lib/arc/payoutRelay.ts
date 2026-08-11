import {
  createWalletClient,
  http,
  isAddress,
  publicActions,
  type Address,
  type Hash,
} from "viem";
import { arcTestnet } from "@/lib/arc/chains";
import { arcPublicClient } from "@/lib/arc/publicClient";
import { usdcAbi, USDC_TOKEN_ADDRESS } from "@/lib/arc/tokens";

export type PayoutCustodyMode = "raw-key" | "circle";

/**
 * Selects which custody path submits the real payout transaction.
 * Defaults to "raw-key" -- the existing, already-proven path -- so an
 * unset or misspelled value never silently changes behavior; "circle"
 * must be selected explicitly and exactly. Server-only: never exposed
 * through a NEXT_PUBLIC_ variable.
 */
export function getPayoutCustodyMode(): PayoutCustodyMode {
  return process.env.PAYOUT_CUSTODY_MODE === "circle" ? "circle" : "raw-key";
}

/**
 * The address creators must grant their USDC allowance to, and the address
 * that submits the payout transferFrom -- resolved according to the active
 * custody mode. Each mode's own module is imported lazily (not statically
 * at the top of this file) so that selecting "circle" never requires
 * ARC_EXECUTOR_PRIVATE_KEY to be set, and selecting "raw-key" (the
 * default) never requires any Circle configuration to exist -- the two
 * paths stay fully independent.
 */
export async function getExecutorAddress(): Promise<Address> {
  if (getPayoutCustodyMode() === "circle") {
    const { getCircleExecutorAddress } = await import("@/lib/circle/executorWallet");
    return getCircleExecutorAddress();
  }

  const { EXECUTOR_ADDRESS } = await import("@/lib/arc/executor");
  return EXECUTOR_ADDRESS;
}

export type PreflightResult = { ok: true } | { ok: false; reason: string };

/**
 * Read-only checks performed before ever submitting a real transaction --
 * these turn the common failure cases (insufficient balance, insufficient
 * allowance, a malformed worker address) into a clean rejection instead of
 * a wasted, reverting on-chain transaction. They are not a substitute for
 * the receipt verification that happens after submission, which remains
 * the only real source of truth for whether the payout actually happened.
 *
 * No explicit chain check here: arcPublicClient is hardcoded to Arc
 * Testnet's own RPC, so these reads can only ever reflect that chain's
 * state in the first place. "Correct chain" is a property of the
 * submitted transaction and its receipt, verified separately.
 */
export async function preflightPayout({
  creatorWallet,
  workerWallet,
  amount,
}: {
  creatorWallet: Address;
  workerWallet: Address;
  amount: bigint;
}): Promise<PreflightResult> {
  if (!isAddress(workerWallet)) {
    return { ok: false, reason: "Worker wallet address is not a valid address." };
  }

  const executorAddress = await getExecutorAddress();

  const [balance, allowance] = await Promise.all([
    arcPublicClient.readContract({
      address: USDC_TOKEN_ADDRESS,
      abi: usdcAbi,
      functionName: "balanceOf",
      args: [creatorWallet],
    }),
    arcPublicClient.readContract({
      address: USDC_TOKEN_ADDRESS,
      abi: usdcAbi,
      functionName: "allowance",
      args: [creatorWallet, executorAddress],
    }),
  ]);

  if (balance < amount) {
    return {
      ok: false,
      reason: "Creator's USDC balance is insufficient for this payout.",
    };
  }

  if (allowance < amount) {
    return {
      ok: false,
      reason: "Creator's USDC allowance for the executor is insufficient.",
    };
  }

  return { ok: true };
}

/**
 * Submits the real transferFrom(creator, worker, amount) transaction via
 * whichever custody mode is active. In both modes the executor is only
 * ever the transaction submitter/delegated spender -- this call cannot and
 * does not route funds through the executor's own address; ERC-20
 * transferFrom semantics move funds directly from `creatorWallet` to
 * `workerWallet`.
 *
 * "circle" mode's own internal async create-then-poll lifecycle is fully
 * contained in lib/circle/payoutTransfer.ts; by the time this function
 * returns, the caller (the payout route) already has a real on-chain hash
 * either way, and its own existing independent Arc RPC receipt
 * verification (unchanged) runs identically regardless of which mode
 * produced it.
 */
export async function submitPayoutTransfer({
  creatorWallet,
  workerWallet,
  amount,
}: {
  creatorWallet: Address;
  workerWallet: Address;
  amount: bigint;
}): Promise<Hash> {
  if (getPayoutCustodyMode() === "circle") {
    const { submitCirclePayoutTransfer } = await import("@/lib/circle/payoutTransfer");
    return submitCirclePayoutTransfer({ creatorWallet, workerWallet, amount });
  }

  const { executorAccount } = await import("@/lib/arc/executor");
  const executorClient = createWalletClient({
    account: executorAccount,
    chain: arcTestnet,
    transport: http(),
  }).extend(publicActions);

  return executorClient.writeContract({
    address: USDC_TOKEN_ADDRESS,
    abi: usdcAbi,
    functionName: "transferFrom",
    args: [creatorWallet, workerWallet, amount],
  });
}
