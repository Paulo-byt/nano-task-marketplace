import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  getDashboardSummary,
  getRecentActivity,
} from "@/services/dashboard/mockDashboardService";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";

export async function GET() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const sessionUser = await getSessionUser(sessionId);
  if (!sessionUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const rateLimitResult = checkRateLimit(
    `read:${sessionUser.id}`,
    RATE_LIMITS.authenticatedRead
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const [summary, activity] = await Promise.all([
    getDashboardSummary(sessionUser.id),
    getRecentActivity(sessionUser.id),
  ]);

  return NextResponse.json({ summary, activity });
}
