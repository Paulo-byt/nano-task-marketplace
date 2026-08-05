import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export async function getUserByWallet(rawAddress: string) {
  const address = normalizeAddress(rawAddress);

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.walletAddress, address))
    .limit(1);

  return rows[0];
}

/**
 * Resolves the user for a connected wallet, creating one on first sight.
 * Retries the lookup on insert failure to stay correct under a race
 * between two concurrent first-time requests from the same address.
 */
export async function getOrCreateUserByWallet(rawAddress: string) {
  const address = normalizeAddress(rawAddress);

  const existing = await getUserByWallet(address);
  if (existing) {
    return existing;
  }

  try {
    const [created] = await db
      .insert(users)
      .values({ walletAddress: address })
      .returning();

    return created;
  } catch {
    const retry = await getUserByWallet(address);
    if (retry) {
      return retry;
    }
    throw new Error("Failed to resolve wallet user.");
  }
}
