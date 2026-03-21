import { clusterApiUrl } from "@solana/web3.js";

export const SOLANA_NETWORK = "devnet" as const;

export const SOLANA_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet");

export const USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export const EXPLORER_BASE_URL = "https://explorer.solana.com";

export function explorerUrl(
  signature: string,
  type: "tx" | "address" = "tx"
): string {
  return `${EXPLORER_BASE_URL}/${type}/${signature}?cluster=${SOLANA_NETWORK}`;
}
