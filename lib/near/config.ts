// Network settings with testnet defaults. Explorer links point at nearblocks.

export type Network = "testnet" | "mainnet";

export interface NearConfig {
  network: Network;
  rpcUrl: string;
  factory: string;
  explorer: string;
  sponsorId: string;
  botId: string;
}

// rpc.*.near.org is deprecated and answers 429 under load (seen on 2026-11-08), so FastNEAR comes first and the old
// endpoint is only a fallback.
const DEFAULTS: Record<Network, { rpcUrl: string; fallbacks: string[]; factory: string; explorer: string }> = {
  testnet: { rpcUrl: "https://test.rpc.fastnear.com", fallbacks: ["https://rpc.testnet.near.org"], factory: "sputnikv2.testnet", explorer: "https://testnet.nearblocks.io" },
  mainnet: { rpcUrl: "https://free.rpc.fastnear.com", fallbacks: ["https://rpc.mainnet.near.org"], factory: "sputnik-dao.near", explorer: "https://nearblocks.io" },
};

/** The configured RPC first, then the network's defaults, without duplicates. */
export function rpcUrls(cfg: NearConfig): string[] {
  const d = DEFAULTS[cfg.network];
  return [...new Set([cfg.rpcUrl, d.rpcUrl, ...d.fallbacks])];
}

export function nearConfig(env: Record<string, string | undefined> = process.env): NearConfig {
  const network: Network = env.NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const d = DEFAULTS[network];
  return {
    network,
    rpcUrl: env.NEAR_RPC_URL || d.rpcUrl,
    factory: env.DAO_FACTORY || d.factory,
    explorer: d.explorer,
    sponsorId: env.SPONSOR_ACCOUNT_ID || "",
    botId: env.BOT_ACCOUNT_ID || "",
  };
}

export const txUrl = (explorer: string, hash: string) => `${explorer}/txns/${hash}`;
export const accountUrl = (explorer: string, id: string) => `${explorer}/address/${id}`;
