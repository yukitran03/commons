// What the Mini App needs to render: the pot, its live rules from the chain, and who the viewer is in it.
import { memberByTg, potByRef } from "@/lib/db.ts";
import { councilOf, votesNeeded } from "@/lib/near/policy.ts";
import { nearConfig } from "@/lib/near/config.ts";
import { authUser, demoMode, getDb, json, readChain } from "@/lib/server.ts";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.ref !== "string") return json({ error: "missing ref" }, 400);
  const db = await getDb();
  const pot = await potByRef(db, body.ref);
  if (!pot) return json({ error: "This link does not belong to a Commons pot." }, 404);

  const cfg = nearConfig();
  const user = authUser(body);
  const me = user ? await memberByTg(db, pot.chat_id, user.id) : null;
  let rules: { council: string[]; needed: number; holdsYocto: string } | null = null;
  if (pot.dao_id) {
    const chain = readChain();
    const policy = await chain.getPolicy(pot.dao_id);
    rules = { council: councilOf(policy), needed: votesNeeded(policy), holdsYocto: (await chain.balance(pot.dao_id)).toString() };
  }
  return json({
    ref: pot.ref,
    title: pot.title,
    daoId: pot.dao_id,
    network: cfg.network,
    rpcUrl: cfg.rpcUrl,
    explorer: cfg.explorer,
    sponsorId: cfg.sponsorId,
    rules,
    me: me ? { accountId: me.account_id, role: me.role } : null,
    signedIn: !!user,
    demo: demoMode(),
  });
}
