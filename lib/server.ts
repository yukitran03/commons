// Server-side wiring from environment variables. Route handlers and pages import from here.
import { openDb, type Db } from "./db.ts";
import { RpcChain } from "./near/rpcChain.ts";
import { nearConfig } from "./near/config.ts";
import { httpTg } from "./telegram.ts";
import { verifyInitData, type TgUser } from "./tgauth.ts";
import type { Deps } from "./pot.ts";

let db: Promise<Db> | null = null;
export function getDb(): Promise<Db> {
  return (db ??= openDb(process.env.DATABASE_URL || undefined));
}

/** Read-only chain access: needs no keys (ledger page, verify). */
export function readChain(): RpcChain {
  const c = nearConfig();
  return new RpcChain({ network: c.network, rpcUrl: c.rpcUrl, factory: c.factory });
}

function need(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`missing environment variable ${k}`);
  return v;
}

let deps: Promise<Deps> | null = null;
export function getDeps(): Promise<Deps> {
  deps ??= (async () => {
    const c = nearConfig();
    const chain = readChain();
    return {
      db: await getDb(),
      tg: httpTg(need("TELEGRAM_BOT_TOKEN")),
      chain,
      sponsor: chain.signerFromKey(need("SPONSOR_ACCOUNT_ID"), need("SPONSOR_PRIVATE_KEY")),
      bot: chain.signerFromKey(need("BOT_ACCOUNT_ID"), need("BOT_PRIVATE_KEY")),
      cfg: {
        network: c.network,
        botUsername: process.env.TELEGRAM_BOT_USERNAME || "",
        appShortName: process.env.TELEGRAM_APP_SHORT_NAME || "",
        appUrl: process.env.APP_URL || "http://localhost:3000",
        explorer: c.explorer,
      },
    };
  })().catch((e) => {
    deps = null;
    throw e;
  });
  return deps;
}

/** Demo mode lets a browser outside Telegram act as a named user. Testnet only, never on mainnet. */
export const demoMode = () => process.env.DEMO_MODE === "1" && nearConfig().network === "testnet";

export function authUser(body: { initData?: string; demoUser?: TgUser }): TgUser | null {
  if (body.initData) {
    const r = verifyInitData(body.initData, process.env.TELEGRAM_BOT_TOKEN || "", Math.floor(Date.now() / 1000));
    return r.ok ? r.user : null;
  }
  if (demoMode() && body.demoUser && Number.isInteger(body.demoUser.id) && body.demoUser.id > 0) {
    return { id: body.demoUser.id, username: body.demoUser.username, first_name: body.demoUser.first_name };
  }
  return null;
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });
