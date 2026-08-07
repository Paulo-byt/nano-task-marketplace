import { randomBytes } from "node:crypto";
import { recoverMessageAddress } from "viem";
import { arcTestnet } from "@/lib/arc/chains";

export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

export interface SiweMessageParams {
  domain: string;
  address: string;
  nonce: string;
  issuedAt: string;
}

export function buildSiweMessage({
  domain,
  address,
  nonce,
  issuedAt,
}: SiweMessageParams): string {
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    "Sign in to Nano Task Marketplace.",
    "",
    `URI: https://${domain}`,
    "Version: 1",
    `Chain ID: ${arcTestnet.id}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export function extractNonce(message: string): string | null {
  const match = message.match(/^Nonce: (.+)$/m);
  return match ? match[1].trim() : null;
}

export async function verifySiweSignature(
  message: string,
  signature: `0x${string}`,
  expectedAddress: string
): Promise<boolean> {
  try {
    const recovered = await recoverMessageAddress({ message, signature });
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}
