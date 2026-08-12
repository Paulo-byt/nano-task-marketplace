import { NextResponse } from "next/server";
import { log } from "@/lib/log";

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  key: string;
  limited: boolean;
  remaining: number;
  resetAt: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory, single-process, fixed-window rate limiter. Deliberately not
 * backed by Redis/Upstash/any external store -- Phase 9 targets the
 * current single-instance testnet deployment only. A horizontally scaled
 * deployment would need a shared store instead, since each process would
 * otherwise keep its own independent counters; that is out of scope until
 * the app is actually deployed across multiple instances.
 *
 * Entries for keys that stop being checked are never proactively swept --
 * at testnet scale (a small, bounded set of real wallets/IPs) this is not
 * a meaningful memory concern, and every entry that IS still in use gets
 * naturally overwritten once its window expires, which is the common case.
 */
const buckets = new Map<string, RateLimitEntry>();

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + config.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { key, limited: false, remaining: config.limit - 1, resetAt };
  }

  if (existing.count >= config.limit) {
    return { key, limited: true, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    key,
    limited: false,
    remaining: config.limit - existing.count,
    resetAt: existing.resetAt,
  };
}

/**
 * Best-effort client IP for unauthenticated routes (no session identity
 * exists yet to key on instead). Prefers a proxy-supplied header since the
 * app is not directly internet-facing in every deployment shape; falls
 * back to a fixed key so rate limiting degrades to "one shared bucket"
 * rather than silently doing nothing if neither header is present.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const real = request.headers.get("x-real-ip");
  if (real) {
    return real.trim();
  }
  return "unknown";
}

export function rateLimitResponse(result: RateLimitResult) {
  log.warn("rate_limit_exceeded", { key: result.key, resetAt: result.resetAt });
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": Math.max(
          1,
          Math.ceil((result.resetAt - Date.now()) / 1000)
        ).toString(),
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Named per-route configs. Purpose-specific, not one arbitrary global
// number -- see the Phase 9 plan for the reasoning behind each limit.
// applicationCreate is deliberately kept well above the Step 14
// application-velocity fraud signal's own threshold (>10/hour) so that
// signal remains the first line of detection rather than being made
// unreachable by the rate limiter itself.
// ---------------------------------------------------------------------------

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const RATE_LIMITS = {
  authNonce: { limit: 10, windowMs: 5 * MINUTE },
  authVerify: { limit: 20, windowMs: 5 * MINUTE },
  authLogout: { limit: 20, windowMs: MINUTE },
  taskCreate: { limit: 20, windowMs: HOUR },
  taskFund: { limit: 20, windowMs: HOUR },
  taskCancel: { limit: 30, windowMs: HOUR },
  applicationCreate: { limit: 40, windowMs: HOUR },
  applicationApprove: { limit: 30, windowMs: HOUR },
  applicationReject: { limit: 30, windowMs: HOUR },
  applicationRevokeApproval: { limit: 30, windowMs: HOUR },
  applicationPayout: { limit: 10, windowMs: HOUR },
  applicationSubmit: { limit: 30, windowMs: HOUR },
  applicationEvaluate: { limit: 5, windowMs: HOUR },
  applicationAnalyzeFraudRisk: { limit: 5, windowMs: HOUR },
  aiGenerateTask: { limit: 10, windowMs: HOUR },
  authenticatedRead: { limit: 120, windowMs: MINUTE },
} as const satisfies Record<string, RateLimitConfig>;
