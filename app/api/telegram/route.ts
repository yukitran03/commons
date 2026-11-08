// Telegram webhook. Telegram signs nothing, so the secret token set with setWebhook is the only proof of origin.
import { timingSafeEqual } from "node:crypto";
import { handleUpdate } from "@/lib/bot/handlers.ts";
import { getDeps } from "@/lib/server.ts";

export const maxDuration = 60;

function sameSecret(got: string | null, want: string | undefined): boolean {
  if (!got || !want) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!sameSecret(req.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await req.json().catch(() => null);
  if (!update) return new Response("bad request", { status: 400 });
  try {
    await handleUpdate(await getDeps(), update);
  } catch (e) {
    // Answer 200 anyway: a failing update must not make Telegram retry it forever.
    console.error("update failed", update?.update_id, e);
  }
  return new Response("ok");
}
