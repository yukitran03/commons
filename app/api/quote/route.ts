// A live 1Click quote for chipping in from another chain. Testnet pots get dry-run quotes only: Intents settle on
// NEAR mainnet, so no deposit address is ever handed out for a testnet pot.
import { potByRef } from "@/lib/db.ts";
import { quoteChipIn, SOURCES } from "@/lib/intents.ts";
import { nearConfig } from "@/lib/near/config.ts";
import { getDb, json } from "@/lib/server.ts";

export const maxDuration = 45;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const src = SOURCES.find((s) => s.id === body.sourceId);
  if (typeof body.ref !== "string" || !src || typeof body.amount !== "string") return json({ error: "missing fields" }, 400);
  const pot = await potByRef(await getDb(), body.ref);
  if (!pot?.dao_id) return json({ error: "No treasury for this pot." }, 404);
  // Live deposits need mainnet, an explicit opt-in, and the member's own refund address on the source chain.
  const live = nearConfig().network === "mainnet" && process.env.INTENTS_LIVE === "1" && typeof body.refundTo === "string" && body.refundTo.length > 0;
  const refundTo = live ? body.refundTo : src.previewRefund;
  const q = await quoteChipIn({ sourceId: src.id, amount: body.amount, recipient: pot.dao_id, refundTo, dry: !live, jwt: process.env.ONECLICK_JWT || undefined });
  if (!q.ok) return json({ ok: false, reason: q.reason });
  return json({ ok: true, amountIn: q.amountIn, amountOut: q.amountOut, minAmountOut: q.minAmountOut, timeEstimateSec: q.timeEstimateSec, depositAddress: q.depositAddress, dry: !q.depositAddress });
}
