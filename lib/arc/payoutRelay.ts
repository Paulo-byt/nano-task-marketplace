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
import { executorAccount, EXECUTOR_ADDRESS } from "@/lib/arc/executor";

/**
 * The executor's own client, extended with read actions for the preflight
 * checks below. Both the reads and the transferFrom write happen through
 * this same account -- the executor never receives or holds funds at any
 * point; it only spends a creator's already-granted allowance and submits
 * the transaction that moves funds directly creator -> worker.
 */
const executorClient = createWalletClient({
  account: executorAccount,
  chain: arcTestnet,
  transport: http(),
}).extend(publicActions);

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
      args: [creatorWallet, EXECUTOR_ADDRESS],
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
 * Submits the real transferFrom(creator, worker, amount) transaction. The
 * executor is only ever the transaction submitter/delegated spender here
 * -- this call cannot and does not route funds through the executor's own
 * address; the ERC-20 transferFrom semantics move funds directly from
 * `creatorWallet` to `workerWallet`.
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
  return executorClient.writeContract({
    address: USDC_TOKEN_ADDRESS,
    abi: usdcAbi,
    functionName: "transferFrom",
    args: [creatorWallet, workerWallet, amount],
  });
}
