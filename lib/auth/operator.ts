/**
 * Phase M3: platform-operator authorization for treasury-spending actions
 * (currently: submitting a treasury approve() to fund a template's pool).
 * Deliberately NOT a database role or an `isAdmin`/`isOperator` column --
 * the operator set is small, static, changes rarely, and is an
 * infrastructure/ops concern (who is allowed to trigger platform treasury
 * spending), not a user-facing product concept that belongs in the users
 * table. A comma-separated wallet-address allowlist read from an
 * environment variable is the same minimal-footprint pattern this codebase
 * already uses for small, static, infra-level configuration (see
 * getCircleTreasuryWalletId, getCircleExecutorWalletId in lib/circle/).
 *
 * This module never authenticates anyone on its own -- it only answers
 * "is this already-authenticated wallet on the operator list?". The caller
 * (an API route) is responsible for resolving a real, verified session
 * (lib/auth/session.ts) first; isOperatorWallet must only ever be called
 * with a walletAddress that came from that verified session, never from a
 * request body or query parameter.
 */

const rawAllowlist = process.env.PLATFORM_OPERATOR_WALLET_ADDRESSES;

// Parsed once at module load -- process.env doesn't change during a running
// process, and this is a cheap, one-time comma-split, the same posture
// every other single-value env accessor in this codebase already takes
// toward process.env (just a plain read, no lazy/memoized indirection
// needed for something this cheap).
const operatorAddresses = new Set(
  (rawAllowlist ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter((address) => address.length > 0)
);

/**
 * True only when PLATFORM_OPERATOR_WALLET_ADDRESSES is unset or empty --
 * kept separate from isOperatorWallet so a caller can distinguish "nobody
 * can ever be an operator, this deployment is misconfigured" from "this
 * specific wallet just isn't on the list," which matters for giving an
 * operator route a clear, actionable log message instead of a generic
 * rejection when the env var was simply never set.
 */
export function isOperatorAllowlistConfigured(): boolean {
  return operatorAddresses.size > 0;
}

/**
 * Case-insensitive membership check against
 * PLATFORM_OPERATOR_WALLET_ADDRESSES -- wallet addresses are not
 * case-sensitive identity anywhere else in this codebase either (mirrors
 * evaluateApprovalReceipt's owner/spender comparisons in
 * lib/arc/verifyApproval.ts, and FundTaskButton's own isCreator check).
 */
export function isOperatorWallet(walletAddress: string): boolean {
  return operatorAddresses.has(walletAddress.trim().toLowerCase());
}
