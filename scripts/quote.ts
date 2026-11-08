// npm run quote -- [source] [amount] [recipient]: one dry-run NEAR Intents 1Click quote, the same call the Mini App
// makes for "chip in from another chain". Sources: base-usdc, arb-usdc, sol-usdc, eth-usdc, tron-usdt, eth-usdt.
import { SOURCES, quoteChipIn } from "../lib/intents.ts";
import { fromUnits } from "../lib/tokens.ts";

const [sourceId = "arb-usdc", amount = "10", recipient = "commons-demo.sputnik-dao.near"] = process.argv.slice(2);
const src = SOURCES.find((s) => s.id === sourceId);
if (!src) {
  console.error(`unknown source ${sourceId}; use one of ${SOURCES.map((s) => s.id).join(", ")}`);
  process.exit(2);
}
console.log(`Dry quote: ${amount} ${src.label} -> USDC on NEAR for ${recipient}`);
const q = await quoteChipIn({ sourceId, amount, recipient, refundTo: src.previewRefund, dry: true, jwt: process.env.ONECLICK_JWT || undefined });
if (!q.ok) {
  console.log(`No quote: ${q.reason}`);
  process.exitCode = 1;
} else {
  console.log(`The pot would receive ${fromUnits(q.amountOut, 6, 6)} USDC${q.minAmountOut ? ` (at least ${fromUnits(q.minAmountOut, 6, 6)})` : ""}${q.timeEstimateSec ? `, about ${q.timeEstimateSec}s` : ""}.`);
}
