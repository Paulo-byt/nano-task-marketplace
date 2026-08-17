import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { markNotificationRead } from "@/services/dashboard/mockNotificationService";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> }
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

  const rateLimitResult = checkRateLimit(
    `notifications:markRead:${sessionUser.id}`,
    RATE_LIMITS.notificationMarkRead
  );
  if (rateLimitResult.limited) {
    return rateLimitResponse(rateLimitResult);
  }

  const { notificationId } = await params;

  // markNotificationRead scopes its UPDATE to this session's own userId,
  // so a notificationId belonging to another user simply matches zero
  // rows here rather than ever being readable or writable cross-account.
  const updated = await markNotificationRead(notificationId, sessionUser.id);
  if (!updated) {
    return NextResponse.json(
      { error: "Notification not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ status: "read" }, { status: 200 });
}
