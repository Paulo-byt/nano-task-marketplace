import { randomUUID } from "node:crypto";
import type { Hash } from "viem";
import { circleClient } from "@/lib/circle/client";
import { getCircleTreasuryWalletId } from "@/lib/circle/treasuryWallet";
import { getExecutorAddress } from "@/lib/arc/payoutRelay";
import { USDC_TOKEN_ADDRESS } from "@/lib/arc/tokens";
import { log } from "@/lib/log";

export class CircleTreasuryApprovalError extends Error {}

const APPROVE_SIGNATURE = "approve(address,uint256)";

// Same rationale as payoutTransfer.ts's own POLL_TIMEOUT_MS: Circle
// transaction creation is asynchronous, so this caps how long this function
// waits for a real on-chain hash before giving up.
const POLL_TIMEOUT_MS = 120_000;

/**
 * Submits approve(executorAddress, amount) from the Circle-controlled
 * TREASURY wallet -- the counterpart to submitCirclePayoutTransfer
 * (payoutTransfer.ts), which submits transferFrom from the EXECUTOR wallet.
 * Same Circle contract-execution-then-poll-for-hash mechanism, different
 * wallet and different ABI call: this function never touches the executor
 * wallet's funds and never modifies the payout path.
 *
 * amountBaseUnits must already be in USDC base units (6 decimals) -- this
 * function performs no unit conversion and touches no floating-point value
 * at any point, exactly mirroring how submitCirclePayoutTransfer already
 * treats its own `amount` parameter. Convert a human-readable amount the
 * same way the rest of this codebase already does:
 * parseUnits(humanAmount.toFixed(2), USDC_DECIMALS) (see fundTemplatePool,
 * taskTemplatesService.ts).
 *
 * This function's job ends at "here is a real on-chain hash" -- it does not
 * verify the approval's outcome, and it deliberately does not call
 * fundTemplatePool itself. That verification (owner=treasury,
 * spender=executor, amount=amountBaseUnits) and the
 * pool_total_usdc/pool_funding_tx_hash write already exist, unmodified, in
 * fundTemplatePool/recordPoolFunding -- this function only ever produces the
 * txHash those two already expect as input.
 */
export async function submitCircleTreasuryApproval({
  amountBaseUnits,
}: {
  amountBaseUnits: bigint;
}): Promise<Hash> {
  const walletId = getCircleTreasuryWalletId();
  const executorAddress = await getExecutorAddress();

  // Same idempotency rationale as submitCirclePayoutTransfer: a fresh key
  // per real submission attempt, via Node's built-in randomUUID() rather
  // than the SDK's own generateIdempotencyKey (confirmed absent from the
  // compiled runtime bundle -- see payoutTransfer.ts's own comment on this).
  const idempotencyKey = randomUUID();

  let transactionId: string;
  try {
    const created = await circleClient.createContractExecutionTransaction({
      walletId,
      contractAddress: USDC_TOKEN_ADDRESS,
      abiFunctionSignature: APPROVE_SIGNATURE,
      // amountBaseUnits is already in USDC's 6-decimal base units -- passed
      // through as the exact integer string the ABI parameter needs, never
      // re-scaled here.
      abiParameters: [executorAddress, amountBaseUnits.toString()],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey,
    });

    const id = created.data?.id;
    if (!id) {
      throw new CircleTreasuryApprovalError("Circle did not return a transaction id.");
    }
    transactionId = id;
  } catch (err) {
    if (err instanceof CircleTreasuryApprovalError) {
      throw err;
    }
    throw new CircleTreasuryApprovalError(
      `Failed to create the Circle contract-execution transaction: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  log.info("circle_treasury_approval_transaction_created", { transactionId });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);

  try {
    const resolved = await circleClient.getTransaction({
      id: transactionId,
      waitForTxHash: true,
      signal: controller.signal,
    });

    const txHash = resolved.data.transaction.txHash;
    log.info("circle_treasury_approval_hash_obtained", { transactionId, txHash });
    return txHash as Hash;
  } catch (err) {
    log.error("circle_treasury_approval_polling_failed", {
      transactionId,
      message: err instanceof Error ? err.message : String(err),
    });
    throw new CircleTreasuryApprovalError(
      `Failed to obtain an on-chain hash for Circle transaction ${transactionId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timeout);
  }
}
