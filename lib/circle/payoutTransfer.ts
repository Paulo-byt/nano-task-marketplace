import { randomUUID } from "node:crypto";
import type { Address, Hash } from "viem";
import { circleClient } from "@/lib/circle/client";
import { getCircleExecutorWalletId } from "@/lib/circle/executorWallet";
import { USDC_TOKEN_ADDRESS } from "@/lib/arc/tokens";
import { log } from "@/lib/log";

export class CirclePayoutError extends Error {}

const TRANSFER_FROM_SIGNATURE = "transferFrom(address,address,uint256)";

// Circle transaction creation is asynchronous -- the response is a Circle
// transaction record, not an on-chain hash. This caps how long this
// function waits for that transaction to actually reach the chain before
// giving up; the payout route treats a timeout the same as any other
// submission failure (mark failed, never mark completed).
const POLL_TIMEOUT_MS = 120_000;

/**
 * Submits transferFrom(creatorWallet, workerWallet, amount) via Circle's
 * Developer-Controlled Wallets contract-execution API instead of a
 * locally-held private key, then polls until the real on-chain transaction
 * hash is available.
 *
 * This function's job ends at "here is a real on-chain hash" -- it does
 * not verify the transaction's outcome. The caller (submitPayoutTransfer in
 * payoutRelay.ts, invoked from the payout route) independently re-fetches
 * and re-verifies the resulting receipt directly from Arc Testnet's own
 * RPC, exactly as it already does for the raw-key path. Circle reporting a
 * transaction id or a hash is never treated as proof the payout succeeded.
 *
 * Verified against the installed SDK's own type definitions:
 * createContractExecutionTransaction({ walletId, contractAddress,
 * abiFunctionSignature, abiParameters, fee, idempotencyKey? }) and
 * getTransaction({ id, waitForTxHash: true, signal? }), whose
 * `waitForTxHash` mode is the SDK's purpose-built option for "give me the
 * real hash once it exists" -- it works correctly regardless of whether
 * the underlying wallet is EOA- or SCA-style, unlike waiting for a
 * specific named state.
 */
export async function submitCirclePayoutTransfer({
  creatorWallet,
  workerWallet,
  amount,
}: {
  creatorWallet: Address;
  workerWallet: Address;
  amount: bigint;
}): Promise<Hash> {
  const walletId = getCircleExecutorWalletId();

  // A fresh idempotency key per real submission attempt -- the
  // `idempotencyKey` field itself is a real, used part of the installed
  // SDK's compiled bundle (confirmed directly in dist/, not assumed from
  // the .d.ts alone). The SDK's own `generateIdempotencyKey` convenience
  // helper, however, is a types-only artifact -- declared in the type
  // definitions but genuinely absent from the compiled runtime bundle
  // (confirmed the same way: it caused a real build failure, "Did you
  // mean generateEntitySecret?"). Node's standard, always-available
  // randomUUID() satisfies the exact same documented contract (a UUIDv4
  // string) without depending on that missing export. If this exact
  // request is ever retried (e.g. a network-level retry on our side after
  // a response was lost), Circle treats it as the same request and
  // returns the original response rather than submitting a second real
  // transaction.
  const idempotencyKey = randomUUID();

  let transactionId: string;
  try {
    const created = await circleClient.createContractExecutionTransaction({
      walletId,
      contractAddress: USDC_TOKEN_ADDRESS,
      abiFunctionSignature: TRANSFER_FROM_SIGNATURE,
      // amount is already in USDC's 6-decimal base units elsewhere in this
      // codebase (parseUnits'd by the caller) -- passed through as the
      // exact integer string the ABI parameter needs, never re-scaled here.
      abiParameters: [creatorWallet, workerWallet, amount.toString()],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey,
    });

    const id = created.data?.id;
    if (!id) {
      throw new CirclePayoutError("Circle did not return a transaction id.");
    }
    transactionId = id;
  } catch (err) {
    if (err instanceof CirclePayoutError) {
      throw err;
    }
    throw new CirclePayoutError(
      `Failed to create the Circle contract-execution transaction: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  log.info("circle_payout_transaction_created", { transactionId });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);

  try {
    const resolved = await circleClient.getTransaction({
      id: transactionId,
      waitForTxHash: true,
      signal: controller.signal,
    });

    const txHash = resolved.data.transaction.txHash;
    log.info("circle_payout_hash_obtained", { transactionId, txHash });
    return txHash as Hash;
  } catch (err) {
    log.error("circle_payout_polling_failed", {
      transactionId,
      message: err instanceof Error ? err.message : String(err),
    });
    throw new CirclePayoutError(
      `Failed to obtain an on-chain hash for Circle transaction ${transactionId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timeout);
  }
}
