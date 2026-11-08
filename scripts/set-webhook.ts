// npm run set-webhook: points the Telegram bot at APP_URL/api/telegram with the secret token, and sets the command
// menu. Needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and APP_URL (from .env.local or the environment).
import { httpTg } from "../lib/telegram.ts";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

const tg = httpTg(need("TELEGRAM_BOT_TOKEN"));
const url = `${need("APP_URL").replace(/\/$/, "")}/api/telegram`;
await tg.call("setWebhook", { url, secret_token: need("TELEGRAM_WEBHOOK_SECRET"), allowed_updates: ["message", "callback_query", "my_chat_member"], drop_pending_updates: true });
await tg.call("setMyCommands", {
  commands: [
    { command: "commons", description: "Set up or show this group's treasury" },
    { command: "spend", description: "Ask the council to approve a payment" },
    { command: "balance", description: "What the pot holds" },
    { command: "members", description: "Who is on the council" },
    { command: "ledger", description: "Public record of every payment" },
    { command: "help", description: "How Commons works" },
  ],
});
const info = await tg.call("getWebhookInfo", {});
console.log(`Webhook set to ${info.url} (pending updates: ${info.pending_update_count}).`);
