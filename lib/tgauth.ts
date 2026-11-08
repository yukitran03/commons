// Telegram Mini App initData check (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
// secret = HMAC_SHA256(key "WebAppData", bot token); hash = hex(HMAC_SHA256(secret, sorted "key=value" lines)).
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}

function checkString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function hmacHex(botToken: string, data: string): string {
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function verifyInitData(initData: string, botToken: string, nowSec: number, maxAgeSec = 86_400): { ok: true; user: TgUser } | { ok: false; reason: string } {
  if (!initData) return { ok: false, reason: "missing initData" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: "missing hash" };
  const expected = hmacHex(botToken, checkString(params));
  if (!timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"))) return { ok: false, reason: "bad hash" };
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || nowSec - authDate > maxAgeSec) return { ok: false, reason: "expired" };
  try {
    const u = JSON.parse(params.get("user") ?? "");
    if (typeof u?.id !== "number") return { ok: false, reason: "no user" };
    return { ok: true, user: { id: u.id, ...(u.first_name ? { first_name: u.first_name } : {}), ...(u.username ? { username: u.username } : {}) } };
  } catch {
    return { ok: false, reason: "no user" };
  }
}

/** Builds initData the way Telegram does. Used by tests and the offline demo, never to impersonate real users. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  params.set("hash", hmacHex(botToken, checkString(params)));
  return params.toString();
}
