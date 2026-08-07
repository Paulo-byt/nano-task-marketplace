import { NextResponse } from "next/server";
import { isValidAddress } from "@/lib/utils/address";
import { getOrCreateUserByWallet } from "@/services/users/walletUser";
import { createPendingSession } from "@/lib/auth/session";
import { generateNonce } from "@/lib/auth/siwe";

function extractString(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null || !(key in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const walletAddress = extractString(body, "walletAddress");
  if (!walletAddress || !isValidAddress(walletAddress)) {
    return NextResponse.json(
      { error: "A valid walletAddress is required." },
      { status: 400 }
    );
  }

  const user = await getOrCreateUserByWallet(walletAddress);
  const nonce = generateNonce();
  await createPendingSession(user.id, nonce);

  return NextResponse.json({ nonce });
}
