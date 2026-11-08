// Creates the member's named account with the public key their device generated. The private key never arrives here.
import { UserError } from "@/lib/bot/copy.ts";
import { joinPot } from "@/lib/pot.ts";
import { authUser, demoMode, getDeps, json } from "@/lib/server.ts";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const user = authUser(body);
  if (!user) return json({ error: "Open this page from Telegram." }, 401);
  if (typeof body.ref !== "string" || typeof body.publicKey !== "string") return json({ error: "missing fields" }, 400);
  try {
    // Demo identities (testnet only) are not real Telegram users, so Telegram cannot confirm their group membership.
    const demo = !body.initData && demoMode();
    const r = await joinPot(await getDeps(), { ref: body.ref, tgUser: user, publicKey: body.publicKey, skipGroupCheck: demo });
    return json(r);
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400);
    console.error("join failed", e);
    return json({ error: "Could not create your account. Try again in a minute." }, 500);
  }
}
