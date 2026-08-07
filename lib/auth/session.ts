import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

export const SESSION_COOKIE_NAME = "session_id";

const NONCE_TTL_MS = 10 * 60 * 1000; // window to complete sign-in
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // active session lifetime

function generateSessionId(): string {
  return randomBytes(32).toString("hex");
}

export interface PendingSession {
  id: string;
  userId: string;
  walletAddress: string;
  expiresAt: Date;
}

export interface SessionUser {
  id: string;
  walletAddress: string;
  displayName: string | null;
}

/**
 * Creates a pending session for a claimed identity, ahead of signature
 * verification. The same `sessions` row is later promoted in place rather
 * than replaced, so no separate table is needed for the pending state.
 */
export async function createPendingSession(
  userId: string,
  nonce: string
): Promise<void> {
  await db.insert(sessions).values({
    id: generateSessionId(),
    userId,
    nonce,
    expiresAt: new Date(Date.now() + NONCE_TTL_MS),
  });
}

export async function findPendingSessionByNonce(
  nonce: string
): Promise<PendingSession | undefined> {
  const rows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      walletAddress: users.walletAddress,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.nonce, nonce))
    .limit(1);

  return rows[0];
}

/** Promotes a verified pending session into a real, active session. */
export async function promoteSession(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ nonce: null, expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
    .where(eq(sessions.id, sessionId));
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Resolves the authenticated user for an active session id. Returns
 * undefined for a missing, expired, or still-pending (unverified) session,
 * so a leaked or guessed pending session id can never authenticate.
 */
export async function getSessionUser(
  sessionId: string
): Promise<SessionUser | undefined> {
  const rows = await db
    .select({
      id: users.id,
      walletAddress: users.walletAddress,
      displayName: users.displayName,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.nonce),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  return rows[0];
}
