// npm run demo: the whole story offline. No keys, no network, no Telegram. Sputnik rules come from FakeChain,
// a model of the contract checked against testnet by npm run demo:testnet.
import { openDb } from "../lib/db.ts";
import { FakeChain } from "../lib/near/fakeChain.ts";
import { NEAR } from "../lib/near/chain.ts";
import { recordingTg } from "../lib/demo.ts";
import { story } from "./story.ts";

const print = (l: string) => console.log(l);
const chain = new FakeChain();
chain.fund("commons-sponsor.testnet", 100n * NEAR);
chain.fund("commons-bot.testnet", 1n * NEAR);

console.log("Commons offline demo (simulated chain, real bot logic)\n");
const r = await story({
  deps: {
    db: await openDb(),
    tg: recordingTg(print),
    chain,
    sponsor: chain.signer("commons-sponsor.testnet"),
    bot: chain.signer("commons-bot.testnet"),
    cfg: { network: "testnet", botUsername: "commons_near_bot", appShortName: "app", appUrl: "https://commons.example", explorer: "https://testnet.nearblocks.io" },
  },
  signerFor: (accountId) => chain.signer(accountId),
  print,
  title: "Demo Team",
});

console.log(r.failed ? `\n${r.failed} step(s) failed.` : "\nAll steps passed. Run npm run demo:testnet for the same story on NEAR testnet.");
process.exit(r.failed ? 1 : 0);
