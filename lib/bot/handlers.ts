// Telegram updates in, pot actions out.
import { ensurePot, members, potByChat, potByRef } from "../db.ts";
import { councilOf, votesNeeded } from "../near/policy.ts";
import { copy, UserError, who } from "./copy.ts";
import { createTreasury, fmtNear, ledgerUrl, potCard, proposeSpend, type Deps } from "../pot.ts";
import { answer, parsePayload, send } from "../telegram.ts";

const isGroup = (chat: any) => chat?.type === "group" || chat?.type === "supergroup";

function command(text: string, botUsername: string): string | null {
  const m = /^\/([a-z_]+)(?:@(\w+))?(?:\s|$)/i.exec(text.trim());
  if (!m) return null;
  if (m[2] && botUsername && m[2].toLowerCase() !== botUsername.toLowerCase()) return null; // addressed to another bot
  return m[1].toLowerCase();
}

export async function handleUpdate(d: Deps, update: any): Promise<void> {
  if (update.callback_query) return onCallback(d, update.callback_query);
  if (update.my_chat_member) return onMembership(d, update.my_chat_member);
  const msg = update.message;
  if (!msg?.text || !msg.from) return;
  const cmd = command(msg.text, d.cfg.botUsername);
  if (!cmd) return;
  const chatId: number = msg.chat.id;

  if (!isGroup(msg.chat)) {
    // A group button sent this person here with /start <payload>: hand them the Mini App as a web_app button.
    const arg = msg.text.trim().split(/\s+/)[1];
    if (cmd === "start" && arg) {
      const p = parsePayload(arg);
      const pot = p ? await potByRef(d.db, p.ref) : null;
      if (!p || !pot) return void (await send(d.tg, chatId, copy.err.unknownPot));
      const url = `${d.cfg.appUrl.replace(/\/$/, "")}/app?p=${arg}`;
      await send(d.tg, chatId, copy.openApp(pot.title, p), [[{ text: "Open Commons", web_app: { url } }]]);
      return;
    }
    await send(d.tg, chatId, cmd === "help" ? copy.help : copy.privateChat);
    return;
  }

  switch (cmd) {
    case "start":
    case "help":
      await send(d.tg, chatId, copy.help);
      return;
    case "commons": {
      await ensurePot(d.db, chatId, msg.chat.title ?? "this group", d.cfg.network);
      const { text, kb } = await potCard(d, chatId, msg.chat.title ?? "this group");
      await send(d.tg, chatId, text, kb);
      return;
    }
    case "spend": {
      const r = await proposeSpend(d, chatId, msg.from, msg.text);
      if (!r.ok) await send(d.tg, chatId, r.error, undefined, msg.message_id);
      return;
    }
    case "balance": {
      const pot = await potByChat(d.db, chatId);
      if (!pot?.dao_id) return void (await send(d.tg, chatId, pot ? copy.err.noDao : copy.err.noPot));
      await send(d.tg, chatId, copy.balance(fmtNear(await d.chain.balance(pot.dao_id)), pot.dao_id), [[{ text: "Ledger", url: ledgerUrl(d, pot.dao_id) }]]);
      return;
    }
    case "members": {
      const pot = await potByChat(d.db, chatId);
      if (!pot?.dao_id) return void (await send(d.tg, chatId, pot ? copy.err.noDao : copy.err.noPot));
      const policy = await d.chain.getPolicy(pot.dao_id);
      const council = councilOf(policy);
      const ms = await members(d.db, chatId);
      const rows = council.map((a) => {
        const m = ms.find((x) => x.account_id === a);
        return `${m ? who(m) : "outside Telegram"} · <code>${a}</code>`;
      });
      await send(d.tg, chatId, copy.members(rows, votesNeeded(policy)));
      return;
    }
    case "ledger": {
      const pot = await potByChat(d.db, chatId);
      if (!pot?.dao_id) return void (await send(d.tg, chatId, pot ? copy.err.noDao : copy.err.noPot));
      await send(d.tg, chatId, copy.ledger, [[{ text: "Open the ledger", url: ledgerUrl(d, pot.dao_id) }]]);
      return;
    }
  }
}

async function onCallback(d: Deps, cq: any) {
  const chatId: number | undefined = cq.message?.chat?.id;
  if (cq.data !== "create" || chatId === undefined) return void (await answer(d.tg, cq.id));
  try {
    const r = await createTreasury(d, chatId, cq.from.id);
    await answer(d.tg, cq.id, r.created ? "Treasury created." : "This group already has a treasury.");
  } catch (e) {
    if (!(e instanceof UserError)) console.error("create treasury failed", e);
    await answer(d.tg, cq.id, e instanceof UserError ? e.message : copy.err.generic);
  }
}

async function onMembership(d: Deps, m: any) {
  const status = m.new_chat_member?.status;
  const was = m.old_chat_member?.status;
  if (isGroup(m.chat) && (status === "member" || status === "administrator") && (was === "left" || was === "kicked")) {
    await send(d.tg, m.chat.id, copy.addedToGroup);
  }
}
