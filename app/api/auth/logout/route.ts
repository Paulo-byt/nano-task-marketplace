import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rateLimit";

export async function POST(request: Request) {
  const rateLimitResult = checkRateLimit(
    `auth:logout:${getClientIp(request)}`,
    RATE_LIMITS.authLogout
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    await destroySession(sessionId);
  }

  const response = NextResponse.json({ status: "signed-out" });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });

  return response;
}
