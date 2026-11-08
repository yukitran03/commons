import { describe, expect, it } from "vitest";
import { accountName, daoName } from "../lib/near/names.ts";
import { TOKENS, fromUnits, toUnits } from "../lib/tokens.ts";
import { parseSpend } from "../lib/bot/parse.ts";

const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+)$/;

describe("accountName", () => {
  it("uses the Telegram username, lowercased", () => expect(accountName({ username: "Huc_06", id: 1 })).toBe("huc_06"));
  it("falls back without username to the first name plus the last 4 digits of the id", () =>
    expect(accountName({ first_name: "Huấn", id: 98761234 })).toBe("huan-1234"));
  it("maps đ and strips other marks", () => expect(accountName({ first_name: "Đức Anh", id: 5550001 })).toBe("ducanh-0001"));
  it("uses 'member' when nothing usable is left", () => expect(accountName({ first_name: "🙂", id: 42 })).toBe("member-0042"));
  it("never produces doubled or edge separators", () => {
    const n = accountName({ username: "__a__b__", id: 7 });
    expect(n).toMatch(NEAR_ACCOUNT);
    expect(n).toBe("a_b");
  });
  it("is at most 32 characters", () => expect(accountName({ username: "a".repeat(40), id: 1 }).length).toBeLessThanOrEqual(32));
  it("pads very short names to 2 characters", () => expect(accountName({ username: "x", id: 9 }).length).toBeGreaterThanOrEqual(2));
});

describe("daoName", () => {
  it("slugs the chat title and adds a 6-char suffix from the seed", () => expect(daoName("Hackathon Team #1!", "abcdefghij")).toBe("hackathon-team-1-abcdef"));
  it("falls back to 'commons' for titles with no usable characters", () => expect(daoName("✨✨", "zzzzzz")).toBe("commons-zzzzzz"));
  it("stays within 40 characters", () => expect(daoName("x".repeat(80), "abcdef").length).toBeLessThanOrEqual(40));
});

describe("toUnits / fromUnits", () => {
  it("converts decimals exactly", () => {
    expect(toUnits("1.5", 24)).toBe(1_500_000_000_000_000_000_000_000n);
    expect(toUnits("25", 6)).toBe(25_000_000n);
    expect(toUnits("0.000001", 6)).toBe(1n);
  });
  it.each(["0", "0.0", "-1", "1,5", "abc", "", "1.", ".5", "1e3"])("rejects %j", (bad) => expect(() => toUnits(bad, 24)).toThrow("amount"));
  it("rejects more fractional digits than the token has", () => {
    expect(() => toUnits("1.0000000000000000000000001", 24)).toThrow("amount");
    expect(() => toUnits("1.0000001", 6)).toThrow("amount");
  });
  it("formats back with trailing zeros trimmed", () => {
    expect(fromUnits(1_500_000_000_000_000_000_000_000n, 24)).toBe("1.5");
    expect(fromUnits("25000000", 6)).toBe("25");
    expect(fromUnits(123_456_789n, 6, 2)).toBe("123.45");
    expect(fromUnits(0n, 24)).toBe("0");
  });
  it("knows NEAR and USDC", () => {
    expect(TOKENS.NEAR.decimals).toBe(24);
    expect(TOKENS.NEAR.tokenId.testnet).toBe("");
    expect(TOKENS.USDC.decimals).toBe(6);
    expect(TOKENS.USDC.tokenId.testnet).toBeNull();
    expect(TOKENS.USDC.tokenId.mainnet).toBe("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
  });
});

describe("parseSpend", () => {
  it("reads amount, token, handle and reason", () =>
    expect(parseSpend("/spend 2 NEAR @huc pizza night")).toEqual({ ok: true, amount: "2", token: "NEAR", to: "@huc", reason: "pizza night" }));
  it("accepts a lowercase token and an account id without reason", () =>
    expect(parseSpend("/spend 2.5 near bob.testnet")).toEqual({ ok: true, amount: "2.5", token: "NEAR", to: "bob.testnet", reason: "" }));
  it("defaults the token to NEAR", () => expect(parseSpend("/spend 2 @huc taxi")).toEqual({ ok: true, amount: "2", token: "NEAR", to: "@huc", reason: "taxi" }));
  it("reads USDC", () => expect(parseSpend("/spend 25 usdc @huc monitor")).toMatchObject({ ok: true, token: "USDC", amount: "25" }));
  it("ignores the bot mention Telegram adds in groups", () => expect(parseSpend("/spend@commons_near_bot 1 @a b")).toMatchObject({ ok: true, amount: "1", to: "@a" }));
  it.each(["/spend", "/spend 2", "/spend 2 NEAR", "/spend abc @huc", "/spend 0 @huc", "/spend 1,5 @huc", "/spend -1 @huc", "/spend 2 BTC @huc", "/spend 2 NEAR huc"])(
    "refuses %j with a message",
    (text) => {
      const r = parseSpend(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    },
  );
  it("refuses more decimals than USDC has", () => expect(parseSpend("/spend 1.0000001 USDC @huc").ok).toBe(false));
});
