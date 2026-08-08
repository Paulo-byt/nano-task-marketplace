import type { Address } from "viem";

/**
 * Arc Testnet's USDC ERC-20 interface. Distinct from the native, 18-decimal
 * USDC gas representation configured in lib/arc/chains.ts -- this is the
 * standard 6-decimal ERC-20 view used for application-level transfers and
 * balance display. The two are never mixed in the same calculation.
 *
 * Address verified against docs.arc.io/arc/references/contract-addresses.md.
 * Re-confirm against that source (or an equivalent authoritative Arc/Circle
 * reference) before this is relied on for any real transaction.
 */
export const USDC_TOKEN_ADDRESS: Address =
  "0x3600000000000000000000000000000000000000";

export const USDC_DECIMALS = 6;

/**
 * Only the functions and events the approved payment architecture actually
 * needs: reading balances/allowances, granting a delegated allowance
 * (funding), and the relay call a pre-approved spender executes (payout).
 * Standard ERC-20 signatures -- not Arc- or app-specific.
 */
export const usdcAbi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "spender", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;
