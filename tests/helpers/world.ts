// A fake Telegram plus an in-memory chain and database: the whole bot runs without network or keys.
import { KeyPair } from "near-api-js";
import { openDb } from "../../lib/db.ts";
import { FakeChain } from "../../lib/near/fakeChain.ts";
import { NEAR } from "../../lib/near/chain.ts";
import type { Deps } from "../../lib/pot.ts";
import type { Tg } from "../../lib/telegram.ts";

export interface TgCall {
  method: string;
  body: any;
}

export function fakeTg(): Tg & { calls: TgCall[]; sent: () => TgCall[]; texts: () => string[] } {
  const calls: TgCall[] = [];
  let id = 100;
  return {
    calls,
    async call(method, body) {
      calls.push({ method, body });
      if (method === "sendMessage") return { message_id: ++id, chat: { id: body.chat_id } };
      return true;
    },
    sent: () => calls.filter((c) => c.method === "sendMessage"),
    texts: () => calls.filter((c) => c.method === "sendMessage" || c.method === "editMessageText").map((c) => c.body.text as string),
  };
}

export const people = {
  alice: { id: 101, first_name: "Alice", username: "alice" },
  bob: { id: 102, first_name: "Bob", username: "bob" },
  carol: { id: 103, first_name: "Carol", username: "carol" },
  eve: { id: 666, first_name: "Eve", username: "eve" },
};

export const CHAT = -1001234;

export async function world() {
  const db = await openDb();
  const tg = fakeTg();
  const chain = new FakeChain();
  chain.fund("sponsor.testnet", 100n * NEAR);
  chain.fund("bot.testnet", 1n * NEAR);
  const deps: Deps = {
    db,
    tg,
    chain,
    sponsor: chain.signer("sponsor.testnet"),
    bot: chain.signer("bot.testnet"),
    cfg: { network: "testnet", botUsername: "commons_near_bot", appShortName: "app", appUrl: "https://commons.test", explorer: "https://testnet.nearblocks.io" },
  };
  let updateId = 1;
  let messageId = 1;
  const msg = (from: (typeof people)[keyof typeof people], text: string, chatId = CHAT) => ({
    update_id: updateId++,
    message: { message_id: messageId++, from, chat: { id: chatId, type: chatId < 0 ? "supergroup" : "private", title: "Hack Team" }, date: 1_762_560_000, text },
  });
  const tap = (from: (typeof people)[keyof typeof people], data: string, chatId = CHAT) => ({
    update_id: updateId++,
    callback_query: { id: `cb${updateId}`, from, data, message: { message_id: 1, chat: { id: chatId, type: "supergroup", title: "Hack Team" } } },
  });
  const publicKey = () => KeyPair.fromRandom("ed25519").getPublicKey().toString();
  return { db, tg, chain, deps, msg, tap, publicKey };
}
