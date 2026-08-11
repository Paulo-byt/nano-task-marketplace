import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rateLimit";

export async function GET(request: Request) {
  const rateLimitResult = checkRateLimit(
    `auth:session:${getClientIp(request)}`,
    RATE_LIMITS.authenticatedRead
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return NextResponse.json({ authenticated: false });
  }

  const user = await getSessionUser(sessionId);
  if (!user) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    walletAddress: user.walletAddress,
  });
}
