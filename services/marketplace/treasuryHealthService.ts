import { desc, sql } from "drizzle-orm";
import { formatUnits, parseUnits } from "viem";
import { db } from "@/db";
import { platformTreasuryAllowanceEvents, taskTemplates } from "@/db/schema";
import { getExecutorAddress } from "@/lib/arc/payoutRelay";
import { getTreasuryAddress } from "@/lib/circle/treasuryWallet";
import { arcPublicClient } from "@/lib/arc/publicClient";
import { arcTestnet } from "@/lib/arc/chains";
import { usdcAbi, USDC_TOKEN_ADDRESS, USDC_DECIMALS } from "@/lib/arc/tokens";
import { getTotalCompletedPlatformPayoutsUsdc } from "@/services/marketplace/treasuryAllowanceService";

export type TreasuryHealthStatus =
  | "HEALTHY"
  | "LOW_ALLOWANCE"
  | "LOW_TREASURY_BALANCE"
  | "LOW_GAS"
  | "CRITICAL"
  | "UNKNOWN";

export interface TreasuryHealthSnapshot {
  status: TreasuryHealthStatus;
  treasuryUsdcBalance: string;
  treasuryNativeBalance: string;
  executorNativeBalance: string;
  liveAllowanceUsdc: string;
  ledgerCeilingUsdc: string | null;
  totalReservedUsdc: string;
  remainingHeadroomUsdc: string | null;
}

// Testnet/development-phase thresholds only: simple ratios against the
// ledger's own recorded ceiling, not a calibrated mainnet economic model.
// Deliberately conservative and easy to reason about rather than clever.
const LOW_ALLOWANCE_RATIO = 0.2;
const LOW_TREASURY_BALANCE_RATIO = 0.2;

// Native gas floor. Explicitly NOT claimed to be a measured, production-
// safe amount -- no code in this codebase has ever read a native balance
// before this file (confirmed by grep during the audit that preceded this
// change), so there is no real Arc Testnet gas-cost data to calibrate
// against yet. A small, conservative placeholder, revisited once real
// transaction costs are known -- especially before any mainnet use.
const MIN_NATIVE_GAS_BALANCE = parseUnits("0.01", arcTestnet.nativeCurrency.decimals);

/**
 * Post-M6: a single, read-only snapshot of everything that determines
 * whether the platform can keep safely reserving template pools and paying
 * workers -- reuses the exact same resolvers and RPC read methods
 * reserveTemplatePool/preflightPayout already use (getTreasuryAddress,
 * getExecutorAddress, arcPublicClient.readContract against the existing
 * usdcAbi), plus arcPublicClient.getBalance for native gas, which no other
 * code in this codebase calls yet. Every read here is either a gas-free RPC
 * call or a plain SELECT -- never a transaction, never a write, never a
 * Circle API call. Wallet addresses themselves are resolved internally but
 * deliberately never included in the returned snapshot.
 */
export async function getTreasuryHealthSnapshot(): Promise<TreasuryHealthSnapshot> {
  const treasuryAddress = await getTreasuryAddress();
  const executorAddress = await getExecutorAddress();

  const [
    treasuryUsdcBalanceBaseUnits,
    treasuryNativeBalanceBaseUnits,
    executorNativeBalanceBaseUnits,
    liveAllowanceBaseUnits,
  ] = await Promise.all([
    arcPublicClient.readContract({
      address: USDC_TOKEN_ADDRESS,
      abi: usdcAbi,
      functionName: "balanceOf",
      args: [treasuryAddress],
    }),
    arcPublicClient.getBalance({ address: treasuryAddress }),
    arcPublicClient.getBalance({ address: executorAddress }),
    arcPublicClient.readContract({
      address: USDC_TOKEN_ADDRESS,
      abi: usdcAbi,
      functionName: "allowance",
      args: [treasuryAddress, executorAddress],
    }),
  ]);

  const [ledgerRow] = await db
    .select()
    .from(platformTreasuryAllowanceEvents)
    .orderBy(desc(platformTreasuryAllowanceEvents.createdAt))
    .limit(1);

  const [{ totalReserved }] = await db
    .select({
      totalReserved: sql<string>`COALESCE(SUM(${taskTemplates.poolTotalUsdc}), 0)`,
    })
    .from(taskTemplates);

  // Post-M6 lifecycle fix: nets out every already-completed platform
  // payout, the same correction reserveTemplatePool now applies to its own
  // "proposed total" -- otherwise this snapshot's totalReservedUsdc would
  // permanently overstate what's genuinely still outstanding, exactly the
  // inconsistency (ceiling 45 vs live allowance 44.8, reserved reported as
  // 45) this fix exists to close. Both call sites now always agree.
  const totalCompletedPayoutsUsdc = await getTotalCompletedPlatformPayoutsUsdc();

  const treasuryUsdcBalance = Number(formatUnits(treasuryUsdcBalanceBaseUnits, USDC_DECIMALS));
  const liveAllowanceUsdc = Number(formatUnits(liveAllowanceBaseUnits, USDC_DECIMALS));
  const ledgerCeilingUsdc = ledgerRow ? Number(ledgerRow.approvedAmountUsdc) : null;
  const totalReservedUsdc = Number(totalReserved) - totalCompletedPayoutsUsdc;
  const remainingHeadroomUsdc =
    ledgerCeilingUsdc !== null ? ledgerCeilingUsdc - totalReservedUsdc : null;

  const lowGas =
    treasuryNativeBalanceBaseUnits < MIN_NATIVE_GAS_BALANCE ||
    executorNativeBalanceBaseUnits < MIN_NATIVE_GAS_BALANCE;

  let status: TreasuryHealthStatus;
  if (ledgerCeilingUsdc === null || ledgerCeilingUsdc === 0) {
    // No ceiling has ever been recorded (or it is explicitly zero) -- the
    // ratio-based allowance/balance checks below are meaningless against a
    // missing or zero baseline, so this snapshot cannot honestly claim
    // HEALTHY or any of the specific *_LOW states that depend on that
    // baseline. Gas never depends on the ceiling, so a real gas problem is
    // still surfaced rather than hidden behind UNKNOWN.
    status = lowGas ? "LOW_GAS" : "UNKNOWN";
  } else {
    const lowAllowance = liveAllowanceUsdc <= ledgerCeilingUsdc * LOW_ALLOWANCE_RATIO;
    const lowBalance = treasuryUsdcBalance <= ledgerCeilingUsdc * LOW_TREASURY_BALANCE_RATIO;
    const problemCount = [lowAllowance, lowBalance, lowGas].filter(Boolean).length;

    if (problemCount >= 2) {
      status = "CRITICAL";
    } else if (lowGas) {
      status = "LOW_GAS";
    } else if (lowBalance) {
      status = "LOW_TREASURY_BALANCE";
    } else if (lowAllowance) {
      status = "LOW_ALLOWANCE";
    } else {
      status = "HEALTHY";
    }
  }

  return {
    status,
    treasuryUsdcBalance: treasuryUsdcBalance.toFixed(2),
    treasuryNativeBalance: formatUnits(
      treasuryNativeBalanceBaseUnits,
      arcTestnet.nativeCurrency.decimals
    ),
    executorNativeBalance: formatUnits(
      executorNativeBalanceBaseUnits,
      arcTestnet.nativeCurrency.decimals
    ),
    liveAllowanceUsdc: liveAllowanceUsdc.toFixed(2),
    ledgerCeilingUsdc: ledgerCeilingUsdc !== null ? ledgerCeilingUsdc.toFixed(2) : null,
    totalReservedUsdc: totalReservedUsdc.toFixed(2),
    remainingHeadroomUsdc:
      remainingHeadroomUsdc !== null ? remainingHeadroomUsdc.toFixed(2) : null,
  };
}
