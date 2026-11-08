// npm run demo:testnet: the same story on NEAR testnet with brand-new accounts. Needs no secrets: every member and bot
// key is generated in this process and thrown away afterwards. Writes docs/demo-run.log.
import { writeFileSync } from "node:fs";
import { KeyPair } from "near-api-js";
import { openDb } from "../lib/db.ts";
import { RpcChain, type RpcSigner } from "../lib/near/rpcChain.ts";
import { nearConfig, rpcUrls, txUrl, accountUrl } from "../lib/near/config.ts";
import { createFaucetAccount } from "../lib/faucet.ts";
import { recordingTg } from "../lib/demo.ts";
import { story } from "./story.ts";

const cfg = nearConfig({ ...process.env, NEAR_NETWORK: "testnet" });
const chain = new RpcChain({ network: "testnet", rpcUrl: cfg.rpcUrl, factory: cfg.factory, fallbackUrls: rpcUrls(cfg).slice(1) });
const lines: string[] = [];
const print = (l: string) => {
  console.log(l);
  lines.push(l);
};

print(`Commons testnet demo, ${new Date().toISOString()}`);
print(`RPC ${cfg.rpcUrl}, DAO factory ${cfg.factory}\n`);
// The sponsor pays for the DAO (6 NEAR) and the member accounts. It comes from SPONSOR_ACCOUNT_ID/SPONSOR_PRIVATE_KEY
// when set, otherwise from one faucet call (the faucet allows only a few accounts per IP per day). The bot is a fresh
// sub-account of the sponsor, so its key is new and used only by this run.
let sponsor: { signer: RpcSigner; accountId: string };
if (process.env.SPONSOR_ACCOUNT_ID && process.env.SPONSOR_PRIVATE_KEY) {
  sponsor = { accountId: process.env.SPONSOR_ACCOUNT_ID, signer: chain.signerFromKey(process.env.SPONSOR_ACCOUNT_ID, process.env.SPONSOR_PRIVATE_KEY) };
  print(`Using sponsor ${sponsor.accountId} from the environment.`);
} else {
  print("Creating a sponsor account from the testnet faucet...");
  sponsor = await createFaucetAccount("cm-sponsor", chain);
}
const botKey = KeyPair.fromRandom("ed25519");
const { accountId: botId } = await chain.createMemberAccount(sponsor.signer, `bot-${Date.now().toString(36)}`, botKey.getPublicKey().toString());
const bot = { accountId: botId, signer: chain.signerFromKey(botId, botKey.toString()) };
print(`sponsor ${sponsor.accountId}\nbot     ${bot.accountId}`);

const r = await story({
  deps: {
    db: await openDb(),
    tg: recordingTg(print),
    chain,
    sponsor: sponsor.signer,
    bot: bot.signer,
    cfg: { network: "testnet", botUsername: "commons_near_bot", appShortName: "app", appUrl: process.env.APP_URL || "https://commons.example", explorer: cfg.explorer },
  },
  signerFor: (accountId, secret) => chain.signerFromKey(accountId, secret),
  print,
  title: "Testnet Demo",
});

print("\nOn chain:");
if (r.daoId) print(`DAO: ${r.daoId}\n  ${accountUrl(cfg.explorer, r.daoId)}`);
for (const [who, id] of Object.entries(r.accounts)) print(`${who}: ${id}`);
print(`bot: ${bot.accountId}`);
for (const t of r.txs) print(`- ${t.label}\n  ${txUrl(cfg.explorer, t.hash)}`);
print(r.failed ? `\n${r.failed} step(s) failed.` : `\nAll steps passed. Check it yourself: npm run verify -- ${r.daoId}`);

writeFileSync(new URL("../docs/demo-run.log", import.meta.url), lines.join("\n") + "\n");
process.exit(r.failed ? 1 : 0);
