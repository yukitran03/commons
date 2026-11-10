// npm run smoke -- [baseUrl] [daoId]: checks a live deployment from the outside, with no secrets.
// Pages render, the ledger reads the chain, and every endpoint refuses what it should refuse.
import { readFileSync } from "node:fs";
import { signInitData } from "../lib/tgauth.ts";

const base = (process.argv[2] || "https://commons-near.vercel.app").replace(/\/$/, "");
let dao = process.argv[3] || "";
if (!dao) {
  try {
    dao = /^DAO: (\S+)/m.exec(readFileSync(new URL("../docs/demo-run.log", import.meta.url), "utf8"))?.[1] ?? "";
  } catch {}
}

let failed = 0;
async function check(what: string, fn: () => Promise<string | true>) {
  try {
    const r = await fn();
    if (r === true) console.log(`PASS  ${what}`);
    else {
      failed++;
      console.log(`FAIL  ${what}\n      ${r}`);
    }
  } catch (e) {
    failed++;
    console.log(`FAIL  ${what}\n      ${(e as Error).message}`);
  }
}
const get = (path: string) => fetch(base + path, { redirect: "manual" });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const expectStatus = async (res: Promise<Response>, status: number, contains?: string): Promise<string | true> => {
  const r = await res;
  const text = await r.text();
  if (r.status !== status) return `expected HTTP ${status}, got ${r.status}: ${text.slice(0, 160)}`;
  if (contains && !text.includes(contains)) return `response does not contain "${contains}"`;
  return true;
};

console.log(`Smoke test of ${base}\n`);
await check("landing page renders", () => expectStatus(get("/"), 200, "Group money nobody has to hold"));
await check("Mini App page renders", () => expectStatus(get("/app"), 200));
if (dao) await check(`public ledger reads ${dao} from the chain and shows the bot is proposer only`, () => expectStatus(get(`/c/${dao}`), 200, "Bot cannot vote or move money"));
await check("unknown DAO gives 404", () => expectStatus(get("/c/does-not-exist-zz.testnet"), 404));
await check("webhook refuses requests without Telegram's secret token", () => expectStatus(post("/api/telegram", { update_id: 1 }), 403));
await check("webhook refuses a wrong secret token", () => expectStatus(post("/api/telegram", { update_id: 1 }, { "x-telegram-bot-api-secret-token": "wrong" }), 403));
await check("unknown pot gives 404", () => expectStatus(post("/api/pot", { ref: "aaaaaaaaaa" }), 404));
await check("join refuses a request without Telegram initData", () => expectStatus(post("/api/join", { ref: "aaaaaaaaaa", publicKey: "ed25519:x" }), 401));
await check("join refuses initData signed with the wrong bot token", () => {
  const forged = signInitData({ user: JSON.stringify({ id: 1, username: "eve" }), auth_date: String(Math.floor(Date.now() / 1000)) }, "000:not-the-bot-token");
  return expectStatus(post("/api/join", { ref: "aaaaaaaaaa", publicKey: "ed25519:x", initData: forged }), 401);
});
await check("vote refuses a request without Telegram initData", () => expectStatus(post("/api/vote", { ref: "aaaaaaaaaa", id: 0 }), 401));
await check("join refuses a made-up demo identity (demo mode is off)", () => expectStatus(post("/api/join", { ref: "aaaaaaaaaa", publicKey: "ed25519:x", demoUser: { id: 5, username: "x" } }), 401));

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exitCode = failed ? 1 : 0;
