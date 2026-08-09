import { createPublicClient, http } from "viem";
import { arcTestnet } from "@/lib/arc/chains";

/**
 * Read-only client for Arc Testnet. No secrets involved -- reading chain
 * state requires no private key -- but this is only ever used server-side
 * today (funding verification), matching the rest of lib/arc's write/verify
 * modules.
 */
export const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});
