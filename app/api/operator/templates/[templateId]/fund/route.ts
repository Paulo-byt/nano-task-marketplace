import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { isOperatorWallet } from "@/lib/auth/operator";
import { getTemplateById } from "@/services/marketplace/taskTemplatesService";
import {
  reserveTemplatePool,
  InvalidTreasuryAllowanceInputError,
  TreasuryTemplateNotFoundError,
  NoTreasuryAllowanceRecordedError,
  InsufficientTreasuryHeadroomError,
  TreasuryLedgerInconsistentError,
  InsufficientOnChainAllowanceError,
  PoolAllocationExceedsRequestedTotalError,
} from "@/services/marketplace/treasuryAllowanceService";
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
 * Phase M3 (multi-template shared treasury allowance), Tier 2 operator
 * entry point: reserves a portion of the already-approved shared treasury
 * ceiling for one template's pool. Auth/allowlist/rate-limit/error-shape
 * unchanged from this route's original version -- the only thing that
 * changed is the funding mechanism itself.
 *
 * No Circle transaction is submitted here anymore, and none of this
 * route's own logic ever reaches submitCircleTreasuryApproval --
 * reserveTemplatePool (treasuryAllowanceService.ts) is a pure database
 * operation, gated entirely by the invariants it checks against the
 * already-recorded ceiling and a fresh, gas-free on-chain allowance read.
 * Raising the shared ceiling itself is now a separate, distinct action:
 * POST /api/operator/treasury/allowance.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
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
    log.warn("operator_fund_unauthorized", { userId: sessionUser.id });
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const rateLimitResult = checkRateLimit(
    `operator:templates:fund:${sessionUser.id}`,
    RATE_LIMITS.operatorTreasuryFund
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const { templateId } = await params;

  // Existence check kept for a clean 404 before touching the reservation
  // logic at all -- same collapsed 400-vs-404 posture every other route in
  // this codebase already takes.
  const template = await getTemplateById(templateId);
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
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

  log.info("operator_reserve_initiated", {
    operatorUserId: sessionUser.id,
    templateId,
    amountUsdc,
  });

  try {
    const result = await reserveTemplatePool(templateId, amountUsdc);

    log.info("operator_reserve_succeeded", {
      operatorUserId: sessionUser.id,
      templateId,
    });

    return NextResponse.json(
      {
        status: "reserved",
        templateId: result.templateId,
        poolTotalUsdc: result.poolTotalUsdc,
        poolAllocatedUsdc: result.poolAllocatedUsdc,
        approvedCeilingUsdc: result.approvedCeilingUsdc,
        totalReservedUsdc: result.totalReservedUsdc,
        remainingHeadroomUsdc: result.remainingHeadroomUsdc,
      },
      { status: 200 }
    );
  } catch (err) {
    log.error("operator_reserve_failed", {
      templateId,
      message: err instanceof Error ? err.message : String(err),
    });
    const status =
      err instanceof InvalidTreasuryAllowanceInputError ||
      err instanceof TreasuryTemplateNotFoundError ||
      err instanceof NoTreasuryAllowanceRecordedError ||
      err instanceof InsufficientTreasuryHeadroomError ||
      err instanceof TreasuryLedgerInconsistentError ||
      err instanceof InsufficientOnChainAllowanceError ||
      err instanceof PoolAllocationExceedsRequestedTotalError
        ? 400
        : 500;
    const message =
      err instanceof Error ? err.message : "Failed to reserve the template pool.";
    return NextResponse.json({ error: message }, { status });
  }
}
