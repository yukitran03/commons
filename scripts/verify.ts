// npm run verify -- [daoId]: checks a live Commons DAO straight from NEAR, trusting nothing from our server.
//   1. the bot role can only propose transfers and new members (no votes, no finalize, no policy changes),
//   2. no role is open to Everyone or to token holders (Member roles),
//   3. the bot never voted,
//   4. every paid transfer carries council approvals.
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
const policy = await chain.getPolicy(dao);
const proposals = await chain.getProposals(dao);
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
