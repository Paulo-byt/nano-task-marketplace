import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseUnits } from "viem";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { isOperatorWallet } from "@/lib/auth/operator";
import {
  fundPlatformTreasuryAllowance,
  TreasuryAllowanceVerificationError,
  InvalidTreasuryAllowanceInputError,
} from "@/services/marketplace/treasuryAllowanceService";
import {
  submitCircleTreasuryApproval,
  CircleTreasuryApprovalError,
} from "@/lib/circle/treasuryApproval";
import { USDC_DECIMALS } from "@/lib/arc/tokens";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import { log } from "@/lib/log";

function extractAmountUsdc(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null || !("amountUsdc" in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>).amountUsdc;
  return typeof value === "number" ? value : undefined;
}

/**
 * Phase M3 (multi-template shared treasury allowance), Tier 1 operator
 * entry point: raises the platform's single, shared treasury-to-executor
 * ceiling. Same auth/allowlist/rate-limit posture as the existing
 * templates/[templateId]/fund route, and the same submit-then-independently
 * -verify-then-record sequence -- submitCircleTreasuryApproval is reused
 * unmodified, and fundPlatformTreasuryAllowance never records anything
 * without first re-verifying the transaction against Arc Testnet itself via
 * the existing, unmodified verifyApprovalTransaction.
 *
 * Distinct from templates/[templateId]/fund: this route is the only one
 * that submits a Circle transaction under the Tier 1/Tier 2 split -- once a
 * sufficient ceiling exists, individual template reservations
 * (reserveTemplatePool) are pure database operations and never reach this
 * code path again.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const sessionUser = await getSessionUser(sessionId);
  if (!sessionUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  if (!isOperatorWallet(sessionUser.walletAddress)) {
    log.warn("operator_treasury_allowance_unauthorized", { userId: sessionUser.id });
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const rateLimitResult = checkRateLimit(
    `operator:treasury:allowance:${sessionUser.id}`,
    RATE_LIMITS.operatorTreasuryAllowance
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const amountUsdc = extractAmountUsdc(body);
  if (amountUsdc === undefined || !Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    return NextResponse.json(
      { error: "A valid, positive amountUsdc is required." },
      { status: 400 }
    );
  }

  const amountBaseUnits = parseUnits(amountUsdc.toFixed(2), USDC_DECIMALS);

  log.info("operator_treasury_allowance_initiated", {
    operatorUserId: sessionUser.id,
    amountUsdc,
  });

  let approvalTxHash;
  try {
    approvalTxHash = await submitCircleTreasuryApproval({ amountBaseUnits });
  } catch (err) {
    log.error("operator_treasury_allowance_submission_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    const message =
      err instanceof CircleTreasuryApprovalError
        ? err.message
        : "Failed to submit the treasury approval transaction.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const recorded = await fundPlatformTreasuryAllowance(approvalTxHash, amountUsdc);

    log.info("operator_treasury_allowance_succeeded", {
      operatorUserId: sessionUser.id,
      approvalTxHash,
    });

    return NextResponse.json(
      {
        status: "allowance_updated",
        approvalTxHash,
        approvedAmountUsdc: recorded.approvedAmountUsdc,
      },
      { status: 200 }
    );
  } catch (err) {
    log.error("operator_treasury_allowance_recording_failed", {
      approvalTxHash,
      message: err instanceof Error ? err.message : String(err),
    });
    const status =
      err instanceof TreasuryAllowanceVerificationError ||
      err instanceof InvalidTreasuryAllowanceInputError
        ? 400
        : 500;
    const message =
      err instanceof Error ? err.message : "Failed to record the treasury allowance.";
    return NextResponse.json({ error: message, approvalTxHash }, { status });
  }
}
