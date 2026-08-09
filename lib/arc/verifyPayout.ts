import { decodeEventLog, type Address, type Hash, type Log } from "viem";
import { arcPublicClient } from "@/lib/arc/publicClient";
import { arcTestnet } from "@/lib/arc/chains";
import { usdcAbi, USDC_TOKEN_ADDRESS } from "@/lib/arc/tokens";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export type PayoutVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

interface DecodedTransfer {
  eventName: "Transfer";
  args: { from: Address; to: Address; value: bigint };
}

export interface ExpectedTransfer {
  expectedFrom: Address;
  expectedTo: Address;
  expectedAmount: bigint;
}

interface ReceiptLike {
  status: "success" | "reverted";
  to: Address | null;
  logs: readonly Log[];
}

/**
 * Pure decode/compare step for a payout's transferFrom transaction --
 * mirrors evaluateApprovalReceipt in verifyApproval.ts exactly, adapted
 * for the Transfer event instead of Approval. Kept deliberately separate
 * from that module (not shared/refactored together) matching this
 * codebase's established convention of not coupling across step
 * boundaries; the eventName pitfall documented there applies identically
 * here, so the same defense (decode every candidate log, check the real
 * matched event name, never trust decodeEventLog's `eventName` parameter
 * as a runtime filter) is repeated rather than imported.
 */
export function evaluatePayoutReceipt(
  receipt: ReceiptLike,
  expected: ExpectedTransfer
): PayoutVerificationResult {
  if (receipt.status !== "success") {
    return { ok: false, reason: "Transaction did not succeed on-chain." };
  }

  if (receipt.to?.toLowerCase() !== USDC_TOKEN_ADDRESS.toLowerCase()) {
    return {
      ok: false,
      reason: "Transaction did not call the configured USDC contract.",
    };
  }

  const candidateLogs = receipt.logs.filter(
    (log) => log.address.toLowerCase() === USDC_TOKEN_ADDRESS.toLowerCase()
  );

  if (candidateLogs.length === 0) {
    return {
      ok: false,
      reason: "No USDC event log found in this transaction.",
    };
  }

  let decoded: DecodedTransfer | undefined;
  for (const log of candidateLogs) {
    try {
      const attempt = decodeEventLog({
        abi: usdcAbi,
        data: log.data,
        topics: log.topics,
      });
      if (attempt.eventName === "Transfer") {
        decoded = attempt as DecodedTransfer;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!decoded) {
    return {
      ok: false,
      reason: "Transaction did not emit a valid Transfer event.",
    };
  }

  const { from, to, value } = decoded.args;

  if (from.toLowerCase() !== expected.expectedFrom.toLowerCase()) {
    return {
      ok: false,
      reason: "Transfer sender does not match the task creator's wallet.",
    };
  }

  if (to.toLowerCase() !== expected.expectedTo.toLowerCase()) {
    return {
      ok: false,
      reason: "Transfer recipient does not match the worker's wallet.",
    };
  }

  if (value !== expected.expectedAmount) {
    return {
      ok: false,
      reason: "Transferred amount does not exactly match the task reward.",
    };
  }

  return { ok: true };
}

/**
 * Network-fetching counterpart to evaluatePayoutReceipt, for verifying a
 * payout transaction independently by hash alone (without an
 * already-in-hand receipt). The payout route itself already has a receipt
 * from waitForTransactionReceipt by the time it verifies, so it calls
 * evaluatePayoutReceipt directly instead of this wrapper -- this exists
 * for symmetry with verifyApprovalTransaction and for any future caller
 * (e.g. a retry step) that needs to re-verify a historical payout tx_hash
 * from scratch.
 */
export async function verifyPayoutTransaction({
  txHash,
  expectedFrom,
  expectedTo,
  expectedAmount,
}: {
  txHash: string;
} & ExpectedTransfer): Promise<PayoutVerificationResult> {
  if (!TX_HASH_RE.test(txHash)) {
    return { ok: false, reason: "Malformed transaction hash." };
  }

  const hash = txHash as Hash;

  let receipt;
  try {
    receipt = await arcPublicClient.getTransactionReceipt({ hash });
  } catch {
    return { ok: false, reason: "Transaction not found on Arc Testnet." };
  }

  try {
    const tx = await arcPublicClient.getTransaction({ hash });
    if (tx.chainId !== undefined && tx.chainId !== arcTestnet.id) {
      return {
        ok: false,
        reason: "Transaction was submitted on the wrong chain.",
      };
    }
  } catch {
    // Non-fatal: the receipt fetch above already establishes the tx exists
    // on this chain's RPC.
  }

  return evaluatePayoutReceipt(receipt, {
    expectedFrom,
    expectedTo,
    expectedAmount,
  });
}
