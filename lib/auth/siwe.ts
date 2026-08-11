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

export function extractDomain(message: string): string | null {
  const match = message.match(
    /^(.+) wants you to sign in with your Ethereum account:$/m
  );
  return match ? match[1].trim() : null;
}

export function extractUri(message: string): string | null {
  const match = message.match(/^URI: (.+)$/m);
  return match ? match[1].trim() : null;
}

export function extractChainId(message: string): number | null {
  const match = message.match(/^Chain ID: (\d+)$/m);
  return match ? Number(match[1]) : null;
}

export interface ExpectedSiweFields {
  domain: string;
  uri: string;
  chainId: number;
}

/**
 * Re-validates the message's own claimed domain/URI/chain-id against
 * known-expected values, rather than trusting what the signed message
 * itself asserts. verifySiweSignature below only proves the signer
 * controls the claimed address -- it says nothing about whether the
 * message was actually intended for this app instance, which is what
 * this check closes. Kept as a separate, pure, single-purpose function
 * (not folded into verifySiweSignature) so the nonce/signature flow
 * around it stays untouched.
 */
export function validateSiweMessageFields(
  message: string,
  expected: ExpectedSiweFields
): boolean {
  const domain = extractDomain(message);
  const uri = extractUri(message);
  const chainId = extractChainId(message);

  return (
    domain !== null &&
    domain.toLowerCase() === expected.domain.toLowerCase() &&
    uri !== null &&
    uri.toLowerCase() === expected.uri.toLowerCase() &&
    chainId !== null &&
    chainId === expected.chainId
  );
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
