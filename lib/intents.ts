// Cross-chain chip-ins through NEAR Intents (1Click API). A member on another chain sends stablecoins to a deposit
// address; solvers deliver USDC on NEAR to the pot's DAO account. Docs: docs.near-intents.org (1Click Swap API).
// Intents run on NEAR mainnet only, so testnet pots show live dry-run quotes and never take deposits.
import { toUnits } from "./tokens.ts";

export const ONECLICK = "https://1click.chaindefuser.com/v0";
export const NEAR_USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

/** Asset ids from GET /v0/tokens on 2026-11-08. previewRefund is a burn-style address used only for dry quotes. */
export const SOURCES = [
  { id: "base-usdc", label: "USDC on Base", assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", decimals: 6, previewRefund: "0x000000000000000000000000000000000000dEaD" },
  { id: "arb-usdc", label: "USDC on Arbitrum", assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", decimals: 6, previewRefund: "0x000000000000000000000000000000000000dEaD" },
  { id: "sol-usdc", label: "USDC on Solana", assetId: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", decimals: 6, previewRefund: "11111111111111111111111111111111" },
  { id: "eth-usdc", label: "USDC on Ethereum", assetId: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", decimals: 6, previewRefund: "0x000000000000000000000000000000000000dEaD" },
  { id: "tron-usdt", label: "USDT on Tron", assetId: "nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near", decimals: 6, previewRefund: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" },
  { id: "eth-usdt", label: "USDT on Ethereum", assetId: "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near", decimals: 6, previewRefund: "0x000000000000000000000000000000000000dEaD" },
] as const;

export type Quote =
  | { ok: true; amountIn: string; amountOut: string; minAmountOut?: string; timeEstimateSec?: number; depositAddress?: string; raw: unknown }
  | { ok: false; reason: string };

export async function quoteChipIn(o: {
  sourceId: string;
  amount: string;
  recipient: string;
  refundTo: string;
  dry: boolean;
  jwt?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<Quote> {
  const src = SOURCES.find((s) => s.id === o.sourceId);
  if (!src) return { ok: false, reason: `unknown source ${o.sourceId}` };
  let amount: bigint;
  try {
    amount = toUnits(o.amount, src.decimals);
  } catch {
    return { ok: false, reason: "bad amount" };
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 30_000);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.jwt) headers.Authorization = `Bearer ${o.jwt}`;
  try {
    const r = await (o.fetchImpl ?? fetch)(`${ONECLICK}/quote`, {
      method: "POST",
      headers,
      signal: ctl.signal,
      body: JSON.stringify({
        dry: o.dry,
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset: src.assetId,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: NEAR_USDC,
        amount: amount.toString(),
        refundTo: o.refundTo,
        refundType: "ORIGIN_CHAIN",
        recipient: o.recipient,
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
      }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j?.quote) return { ok: false, reason: String(j?.message ?? `HTTP ${r.status}`) };
    const q = j.quote;
    return {
      ok: true,
      amountIn: String(q.amountIn),
      amountOut: String(q.amountOut),
      ...(q.minAmountOut ? { minAmountOut: String(q.minAmountOut) } : {}),
      ...(q.timeEstimate !== undefined ? { timeEstimateSec: Number(q.timeEstimate) } : {}),
      ...(q.depositAddress ? { depositAddress: String(q.depositAddress) } : {}),
      raw: j,
    };
  } catch (e) {
    if ((e as Error).name === "AbortError") return { ok: false, reason: "1Click quote timed out" };
    return { ok: false, reason: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export async function chipInStatus(depositAddress: string, fetchImpl: typeof fetch = fetch): Promise<{ status: string; raw: unknown } | null> {
  try {
    const r = await fetchImpl(`${ONECLICK}/status?depositAddress=${encodeURIComponent(depositAddress)}`);
    if (!r.ok) return null;
    const j: any = await r.json();
    return typeof j?.status === "string" ? { status: j.status, raw: j } : null;
  } catch {
    return null;
  }
}
