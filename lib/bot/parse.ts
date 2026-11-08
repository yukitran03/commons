// /spend <amount> [NEAR|USDC] <@member | account.testnet> [what it is for]
import { TOKENS, toUnits, type TokenSymbol } from "../tokens.ts";

export type SpendRequest = { ok: true; amount: string; token: TokenSymbol; to: string; reason: string } | { ok: false; error: string };

const USAGE = "Use it like this: /spend 25 NEAR @name what it is for";
const HANDLE = /^@[A-Za-z0-9_]{1,32}$/;
const ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)+([a-z\d]+[-_])*[a-z\d]+$/;
const IMPLICIT = /^[0-9a-f]{64}$/;

export function isRecipient(s: string): boolean {
  return HANDLE.test(s) || (s.length <= 64 && ACCOUNT.test(s)) || IMPLICIT.test(s);
}

export function parseSpend(text: string): SpendRequest {
  const parts = text.trim().split(/\s+/);
  if (!/^\/spend(@\w+)?$/i.test(parts[0] ?? "")) return { ok: false, error: USAGE };
  const args = parts.slice(1);
  if (args.length < 2) return { ok: false, error: USAGE };

  const amount = args[0];
  let token: TokenSymbol = "NEAR";
  let i = 1;
  const maybeToken = args[1].toUpperCase();
  if (maybeToken in TOKENS) {
    token = maybeToken as TokenSymbol;
    i = 2;
  } else if (!args[1].startsWith("@") && !args[1].includes(".") && /^[a-z]{2,6}$/i.test(args[1]) && args.length > 2) {
    return { ok: false, error: `I can only move NEAR or USDC, not ${args[1]}.` };
  }

  const to = args[i];
  if (!to) return { ok: false, error: USAGE };
  if (!isRecipient(to)) return { ok: false, error: "Say who gets paid: a member's @username or a NEAR account like name.testnet." };

  try {
    toUnits(amount, TOKENS[token].decimals);
  } catch {
    return { ok: false, error: `That amount does not work for ${token}. Use a positive number with a dot for decimals and at most ${TOKENS[token].decimals} decimal places, like 2.5.` };
  }
  return { ok: true, amount, token, to, reason: args.slice(i + 1).join(" ") };
}
