// npm run setup:testnet: creates the two accounts a deployment needs and prints the env lines to paste into Vercel.
//   sponsor: pays for member accounts (0.5 NEAR each) and each group's DAO (6 NEAR of storage). From the faucet
//            (10 NEAR), or reuse one with SPONSOR_ACCOUNT_ID/SPONSOR_PRIVATE_KEY.
//   bot:     a sub-account of the sponsor. Every DAO gives it the "proposer" role and nothing else.
// Keys are printed once to this terminal and never written to disk. Store them in your secret manager.
import { KeyPair } from "near-api-js";
import { RpcChain, type RpcSigner } from "../lib/near/rpcChain.ts";
import { nearConfig, rpcUrls } from "../lib/near/config.ts";
import { createFaucetAccount } from "../lib/faucet.ts";
import { fromUnits } from "../lib/tokens.ts";

const cfg = nearConfig({ ...process.env, NEAR_NETWORK: "testnet" });
const chain = new RpcChain({ network: "testnet", rpcUrl: cfg.rpcUrl, factory: cfg.factory, fallbackUrls: rpcUrls(cfg).slice(1) });

let sponsor: { accountId: string; signer: RpcSigner; privateKey: string };
if (process.env.SPONSOR_ACCOUNT_ID && process.env.SPONSOR_PRIVATE_KEY) {
  sponsor = { accountId: process.env.SPONSOR_ACCOUNT_ID, signer: chain.signerFromKey(process.env.SPONSOR_ACCOUNT_ID, process.env.SPONSOR_PRIVATE_KEY), privateKey: process.env.SPONSOR_PRIVATE_KEY };
} else {
  sponsor = await createFaucetAccount("commons-sponsor", chain);
}
const botKey = KeyPair.fromRandom("ed25519");
const { accountId: botId } = await chain.createMemberAccount(sponsor.signer, "bot", botKey.getPublicKey().toString()).catch(async (e) => {
  if (!/EXISTS/.test(String(e))) throw e;
  return chain.createMemberAccount(sponsor.signer, `bot-${Date.now().toString(36)}`, botKey.getPublicKey().toString());
});

console.log(`Sponsor ${sponsor.accountId} holds ${fromUnits(await chain.balance(sponsor.accountId), 24)} NEAR. Each new group needs about 6.5 NEAR.\n`);
console.log("# Paste into Vercel project settings (or .env.local). Shown once; not saved anywhere.");
console.log(`NEAR_NETWORK=testnet`);
console.log(`SPONSOR_ACCOUNT_ID=${sponsor.accountId}`);
console.log(`SPONSOR_PRIVATE_KEY=${sponsor.privateKey}`);
console.log(`BOT_ACCOUNT_ID=${botId}`);
console.log(`BOT_PRIVATE_KEY=${botKey.toString()}`);
