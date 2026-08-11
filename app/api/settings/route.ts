import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getSettingsSections } from "@/services/dashboard/mockSettingsService";
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

  // No per-wallet preference storage exists yet, so every signed-in user
  // gets the same informational sections -- sessionUser itself is unused
  // below, but the auth check still gates the route so "signed in or not"
  // stays meaningful, ready to diverge once real per-user settings exist.
  const sections = getSettingsSections();
  return NextResponse.json({ sections });
}
