import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getProfileStats } from "@/services/dashboard/mockProfileService";
import { getEarningsSummary } from "@/services/dashboard/mockEarningsService";

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

  const [stats, earnings] = await Promise.all([
    getProfileStats(sessionUser.id),
    getEarningsSummary(sessionUser.id),
  ]);

  return NextResponse.json({
    stats,
    totalEarningsUsdc: earnings.totalEarningsUsdc,
  });
}
