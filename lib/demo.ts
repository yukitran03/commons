// Shared by the offline and testnet demos: a Telegram stand-in that prints what the bot would post, and a step runner.
import type { Tg } from "./telegram.ts";

export function recordingTg(print: (line: string) => void): Tg & { sent: string[] } {
  const sent: string[] = [];
  let id = 500;
  return {
    sent,
    async call(method, body) {
      if (method === "sendMessage" || method === "editMessageText") {
        const text = plain(String(body.text));
        sent.push(text);
        const buttons = ((body.reply_markup as any)?.inline_keyboard ?? []).flat().map((b: any) => `[${b.text}]`).join(" ");
        print(`   ${method === "sendMessage" ? "bot says" : "bot edits"}: ${text.split("\n").join("\n             ")}${buttons ? `\n             ${buttons}` : ""}`);
        return { message_id: ++id };
      }
      return true;
    },
  };
}

export const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

export function steps(print: (line: string) => void) {
  let failed = 0;
  let n = 0;
  return {
    async step(title: string, fn: () => Promise<string | void>) {
      n++;
      print(`\n${n}. ${title}`);
      try {
        const note = await fn();
        print(`   PASS${note ? `  ${note}` : ""}`);
      } catch (e) {
        failed++;
        print(`   FAIL  ${(e as Error).message}`);
      }
    },
    check(cond: unknown, msg: string) {
      if (!cond) throw new Error(msg);
    },
    async expectReject(p: Promise<unknown>, pattern: RegExp): Promise<string> {
      try {
        await p;
      } catch (e) {
        const m = String((e as Error).message);
        if (pattern.test(m)) return m.match(pattern)![0];
        throw new Error(`rejected for the wrong reason: ${m.slice(0, 160)}`);
      }
      throw new Error("expected the chain to refuse, but it accepted");
    },
    get failed() {
      return failed;
    },
  };
}
