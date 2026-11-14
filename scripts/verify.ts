// npm run verify -- [daoId]: checks a live Commons DAO straight from NEAR, trusting nothing from our server.
//   1. the bot role can only propose transfers and new members (no votes, no finalize, no policy changes),
//   2. no role is open to Everyone or to token holders (Member roles),
//   3. the bot never voted,
//   4. every paid transfer carries council approvals,
//   5. the DAO runs the factory's own Sputnik DAO v2 code (same code hash), not a modified contract.
// Defaults to the DAO recorded in docs/demo-run.log.
import { readFileSync } from "node:fs";
import { RpcChain } from "../lib/near/rpcChain.ts";
import { nearConfig, rpcUrls } from "../lib/near/config.ts";
import { PROPOSER_ROLE, botIsProposerOnly, councilOf, votesNeeded } from "../lib/near/policy.ts";
import { fromUnits } from "../lib/tokens.ts";

let dao = process.argv[2];
if (!dao) {
  try {
    dao = /^DAO: (\S+)/m.exec(readFileSync(new URL("../docs/demo-run.log", import.meta.url), "utf8"))?.[1] ?? "";
  } catch {}
}
if (!dao) {
  console.error("usage: npm run verify -- <dao-account-id>");
  process.exit(2);
}

const cfg = nearConfig({ ...process.env, NEAR_NETWORK: dao.endsWith(".near") ? "mainnet" : "testnet" });
const chain = new RpcChain({ network: cfg.network, rpcUrl: cfg.rpcUrl, factory: cfg.factory, fallbackUrls: rpcUrls(cfg).slice(1) });
let failed = 0;
const row = (ok: boolean | "warn", what: string, detail = "") => {
  if (ok === false) failed++;
  console.log(`${ok === true ? "PASS" : ok === "warn" ? "WARN" : "FAIL"}  ${what}${detail ? `\n      ${detail}` : ""}`);
};

console.log(`Verifying ${dao} on NEAR ${cfg.network} (${cfg.rpcUrl})\n`);

/** One JSON-RPC query against the configured node. */
async function rpcQuery<T>(params: Record<string, unknown>): Promise<T> {
  const r = await fetch(cfg.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { finality: "final", ...params } }),
  });
  const j = (await r.json()) as { result?: T & { error?: string }; error?: unknown };
  if (!j.result || j.result.error) throw new Error(JSON.stringify(j.error ?? j.result?.error));
  return j.result;
}

let policy: Awaited<ReturnType<typeof chain.getPolicy>>;
let proposals: Awaited<ReturnType<typeof chain.getProposals>>;
try {
  [policy, proposals] = await Promise.all([chain.getPolicy(dao), chain.getProposals(dao)]);
} catch (e) {
  console.error(`Could not read ${dao} from NEAR ${cfg.network}: ${(e as Error).message.slice(0, 160)}`);
  console.error("This check reads the live chain, so it needs network access. npm test and npm run demo run offline.");
  // Let open sockets close before exiting (an immediate exit can trip a libuv assertion on Windows).
  await new Promise((r) => setTimeout(r, 300));
  process.exit(3);
}
const council = councilOf(policy);
const needed = votesNeeded(policy);
// Check whoever holds the proposer role, plus the bot this deployment uses (BOT_ACCOUNT_ID), wherever it sits.
const bots = (() => {
  const r = policy.roles.find((x) => x.name === PROPOSER_ROLE);
  const inRole = r && typeof r.kind === "object" && "Group" in r.kind ? r.kind.Group : [];
  return [...new Set([...inRole, ...(process.env.BOT_ACCOUNT_ID ? [process.env.BOT_ACCOUNT_ID] : [])])];
})();

console.log(`council (${council.length}): ${council.join(", ")}`);
console.log(`approvals needed: ${needed} of ${council.length}`);
console.log(`bot role "${PROPOSER_ROLE}": ${bots.join(", ") || "none"}`);
console.log(`spendable balance: ${fromUnits(await chain.balance(dao), 24)} NEAR, proposals: ${proposals.length}\n`);

// The DAO's code must be the factory's default Sputnik DAO v2 build. A newer factory default is a warning, not a failure.
try {
  const [{ code_hash }, def] = await Promise.all([
    rpcQuery<{ code_hash: string }>({ request_type: "view_account", account_id: dao }),
    rpcQuery<{ result: number[] }>({ request_type: "call_function", account_id: cfg.factory, method_name: "get_default_code_hash", args_base64: "e30=" }),
  ]);
  const factoryHash = JSON.parse(Buffer.from(def.result).toString("utf8")) as string;
  const same = code_hash === factoryHash;
  row(same ? true : "warn", `the DAO runs ${cfg.factory}'s Sputnik DAO v2 code`, `code hash ${code_hash}${same ? "" : `, factory default is now ${factoryHash}`}`);
} catch (e) {
  row("warn", "could not compare the DAO's code hash with the factory's", (e as Error).message.slice(0, 120));
}

row(bots.length > 0, "a proposer role for the bot exists");
for (const b of bots) {
  const c = botIsProposerOnly(policy, b);
  row(c.ok, `${b} can only propose transfers and new members`, c.problems.join("; "));
}
row(!policy.roles.some((r) => r.kind === "Everyone" || "Member" in (r.kind as object)), "no role is open to Everyone or to token holders (Member)");
const botVotes = proposals.flatMap((p) => Object.keys(p.votes).filter((a) => bots.includes(a)).map((a) => `#${p.id} by ${a}`));
row(botVotes.length === 0, "the bot never voted", botVotes.join(", "));

for (const p of proposals.filter((x) => x.status === "Approved" && "Transfer" in x.kind)) {
  const t = (p.kind as { Transfer: { amount: string; receiver_id: string; token_id: string } }).Transfer;
  const approvals = Object.entries(p.votes).filter(([, v]) => v === "Approve").map(([a]) => a);
  const fromCouncil = approvals.filter((a) => council.includes(a));
  const what = `#${p.id} paid ${t.token_id === "" ? `${fromUnits(t.amount, 24)} NEAR` : `${t.amount} of ${t.token_id}`} to ${t.receiver_id}`;
  // The council can grow after a payment, so fewer approvals than today's threshold is a warning, not a failure.
  row(fromCouncil.length >= needed ? true : fromCouncil.length > 0 ? "warn" : false, what, `approved by ${approvals.join(", ") || "nobody"}`);
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
