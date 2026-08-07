import { NextResponse } from "next/server";
import {
  findPendingSessionByNonce,
  promoteSession,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { extractNonce, verifySiweSignature } from "@/lib/auth/siwe";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // matches lib/auth/session.ts

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

  const message = extractString(body, "message");
  const signature = extractString(body, "signature");

  if (!message || !signature) {
    return NextResponse.json(
      { error: "message and signature are required." },
      { status: 400 }
    );
  }

  const nonce = extractNonce(message);
  if (!nonce) {
    return NextResponse.json(
      { error: "Message did not contain a nonce." },
      { status: 400 }
    );
  }

  const pending = await findPendingSessionByNonce(nonce);
  if (!pending || pending.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "Sign-in request expired or not found. Please try again." },
      { status: 401 }
    );
  }

  const verified = await verifySiweSignature(
    message,
    signature as `0x${string}`,
    pending.walletAddress
  );

  if (!verified) {
    return NextResponse.json(
      { error: "Signature verification failed." },
      { status: 401 }
    );
  }

  await promoteSession(pending.id);

  const response = NextResponse.json({ status: "signed-in" }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, pending.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + SESSION_TTL_MS),
  });

  return response;
}
