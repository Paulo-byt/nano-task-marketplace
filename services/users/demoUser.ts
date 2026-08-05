import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

const DEMO_WALLET_ADDRESS = "demo:wallet";
const DEMO_DISPLAY_NAME = "Demo User";

/**
 * Stand-in for a signed-in wallet user until SIWE auth (Phase 5.x) lands.
 * Always resolves to the same single row, created on first use.
 */
export async function getDemoUser() {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.walletAddress, DEMO_WALLET_ADDRESS))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  try {
    const [created] = await db
      .insert(users)
      .values({
        walletAddress: DEMO_WALLET_ADDRESS,
        displayName: DEMO_DISPLAY_NAME,
      })
      .returning();

    return created;
  } catch {
    const retry = await db
      .select()
      .from(users)
      .where(eq(users.walletAddress, DEMO_WALLET_ADDRESS))
      .limit(1);

    if (retry[0]) {
      return retry[0];
    }
    throw new Error("Failed to resolve demo user.");
  }
}
