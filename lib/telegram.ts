// Plain Bot API over fetch, behind a tiny interface so tests and the demo can record calls instead of sending them.

/** web_app buttons only work in private chats; groups get url buttons. */
export type Kb = { text: string; callback_data?: string; url?: string; web_app?: { url: string } }[][];

export interface Tg {
  call(method: string, body: Record<string, unknown>): Promise<any>;
}

export function httpTg(token: string): Tg {
  return {
    async call(method, body) {
      const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j: any = await r.json();
      if (!j.ok && !/message is not modified/.test(j.description || "")) throw new Error(`telegram ${method}: ${j.description}`);
      return j.result;
    },
  };
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const markup = (kb?: Kb) => (kb ? { inline_keyboard: kb } : undefined);

export const send = (tg: Tg, chatId: number, html: string, kb?: Kb, replyTo?: number) =>
  tg.call("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: markup(kb),
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });

export const edit = (tg: Tg, chatId: number, messageId: number, html: string, kb?: Kb) =>
  tg.call("editMessageText", { chat_id: chatId, message_id: messageId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: markup(kb) });

export const answer = (tg: Tg, callbackId: string, text?: string) => tg.call("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) });

/**
 * Inline web_app buttons only work in private chats, so group messages use a Mini App direct link
 * (t.me/<bot>/<app>?startapp=...), which opens the Mini App inside the group. Without a registered app, a web link.
 */
export function miniAppLink(o: { botUsername: string; appShortName: string; appUrl: string; payload: string }): string {
  if (o.botUsername && o.appShortName) return `https://t.me/${o.botUsername}/${o.appShortName}?startapp=${o.payload}`;
  // No registered Mini App: open the bot's private chat, where /start <payload> answers with a web_app button.
  if (o.botUsername) return `https://t.me/${o.botUsername}?start=${o.payload}`;
  return `${o.appUrl.replace(/\/$/, "")}/app?p=${o.payload}`;
}

export type Payload = { mode: "join" | "chip"; ref: string } | { mode: "vote"; ref: string; id: number };

const REF = "[a-z2-7]{10}";
export function parsePayload(p: string): Payload | null {
  let m = new RegExp(`^([jc])_(${REF})$`).exec(p);
  if (m) return { mode: m[1] === "j" ? "join" : "chip", ref: m[2] };
  m = new RegExp(`^v_(${REF})_(\\d{1,9})$`).exec(p);
  if (m) return { mode: "vote", ref: m[1], id: Number(m[2]) };
  return null;
}

export const joinPayload = (ref: string) => `j_${ref}`;
export const votePayload = (ref: string, id: number) => `v_${ref}_${id}`;
export const chipPayload = (ref: string) => `c_${ref}`;
