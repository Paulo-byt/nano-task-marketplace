import { decodeEventLog, type Address, type Hash, type Log } from "viem";
import { arcPublicClient } from "@/lib/arc/publicClient";
import { arcTestnet } from "@/lib/arc/chains";
import { usdcAbi, USDC_TOKEN_ADDRESS } from "@/lib/arc/tokens";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export type ApprovalVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

interface DecodedApproval {
  eventName: "Approval";
  args: { owner: Address; spender: Address; value: bigint };
}

export interface ExpectedApproval {
  expectedOwner: Address;
  expectedSpender: Address;
  expectedAmount: bigint;
}

interface ReceiptLike {
  status: "success" | "reverted";
  to: Address | null;
  logs: readonly Log[];
}

/**
 * Pure decode/compare step, deliberately separated from the network fetch
 * in verifyApprovalTransaction below so it can be exercised directly
 * against a real-shape (real viem-encoded, if synthetic) receipt without
 * needing a live transaction -- this is the part of the check that
 * previously hid a real bug (see the eventName note below), so it is the
 * part most worth being able to test precisely and in isolation.
 */
export function evaluateApprovalReceipt(
  receipt: ReceiptLike,
  expected: ExpectedApproval
): ApprovalVerificationResult {
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

  // decodeEventLog's `eventName` is a TypeScript-level hint only -- at
  // runtime it decodes whichever event actually matches the log's topic
  // hash and happily returns that event's (differently-shaped) args
  // without throwing. A USDC contract call can emit more than one event
  // (e.g. a Transfer alongside other contract-internal accounting), so both
  // decoding every candidate log and checking the real matched event name
  // are required -- trusting the first address-matching log, or trusting
  // decodeEventLog not to silently return a Transfer's fields under an
  // "Approval" call, previously let a real Transfer log crash this function
  // with a client-facing 500 instead of a clean rejection.
  let decoded: DecodedApproval | undefined;
  for (const log of candidateLogs) {
    try {
      const attempt = decodeEventLog({
        abi: usdcAbi,
        data: log.data,
        topics: log.topics,
      });
      if (attempt.eventName === "Approval") {
        decoded = attempt as DecodedApproval;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!decoded) {
    return {
      ok: false,
      reason: "Transaction did not emit a valid Approval event.",
    };
  }

  const { owner, spender, value } = decoded.args;

  if (owner.toLowerCase() !== expected.expectedOwner.toLowerCase()) {
    return {
      ok: false,
      reason: "Approval owner does not match the task creator's wallet.",
    };
  }

  if (spender.toLowerCase() !== expected.expectedSpender.toLowerCase()) {
    return {
      ok: false,
      reason: "Approval spender is not the platform executor.",
    };
  }

  if (value !== expected.expectedAmount) {
    return {
      ok: false,
      reason: "Approved amount does not exactly match the task reward.",
    };
  }

  return { ok: true };
}

/**
 * Independently verifies a claimed approve() transaction against Arc
 * Testnet itself -- the database is never marked funded off a client-
 * supplied hash alone. Fetches the transaction's actual on-chain receipt,
 * then delegates to evaluateApprovalReceipt for the decode/compare, never
 * trusting anything the client asserts about the transaction's meaning.
 */
export async function verifyApprovalTransaction({
  txHash,
  expectedOwner,
  expectedSpender,
  expectedAmount,
}: {
  txHash: string;
} & ExpectedApproval): Promise<ApprovalVerificationResult> {
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

  // Belt-and-suspenders: the receipt above already came back from Arc
  // Testnet's own RPC (a hash that only exists on another chain simply
  // would not resolve there), but check the transaction's own chainId
  // explicitly too, for an auditable, self-contained rejection reason
  // rather than relying implicitly on which endpoint answered.
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

  return evaluateApprovalReceipt(receipt, {
    expectedOwner,
    expectedSpender,
    expectedAmount,
  });
}
