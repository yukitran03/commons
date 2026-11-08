// Called after a member signed a vote on their device. It only asks the server to re-read the proposal from the chain;
// nothing the client sends is reported as a result.
import { memberByTg, potByRef } from "@/lib/db.ts";
import { refreshProposal, waitForVote } from "@/lib/pot.ts";
import { authUser, getDeps, json } from "@/lib/server.ts";

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const user = authUser(body);
  if (!user) return json({ error: "Open this page from Telegram." }, 401);
  const id = Number(body.id);
  if (typeof body.ref !== "string" || !Number.isInteger(id) || id < 0) return json({ error: "missing fields" }, 400);
  const deps = await getDeps();
  const pot = await potByRef(deps.db, body.ref);
  if (!pot?.dao_id) return json({ error: "No treasury for this pot." }, 404);
  const me = await memberByTg(deps.db, pot.chat_id, user.id);
  if (!me) return json({ error: "Not a member of this pot." }, 403);
  await waitForVote(deps.chain, pot.dao_id, id, me.account_id);
  const p = await refreshProposal(deps, pot.dao_id, id);
  return p ? json({ status: p.status }) : json({ error: "No such proposal." }, 404);
}
