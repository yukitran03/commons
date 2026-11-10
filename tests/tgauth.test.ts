import { describe, expect, it } from "vitest";
import { signInitData, verifyInitData } from "../lib/tgauth.ts";
import { miniAppLink, parsePayload } from "../lib/telegram.ts";

const TOKEN = "1234567890:AAFakeTokenForTestsOnly_xxxxxxxxxxxx";
const NOW = 1_762_560_000;
const user = JSON.stringify({ id: 11, first_name: "Huc", username: "huc06" });
const signed = (over: Record<string, string> = {}) => signInitData({ query_id: "AAE1", user, auth_date: String(NOW - 60), ...over }, TOKEN);

describe("verifyInitData", () => {
  it("accepts data signed with the bot token and returns the user", () => {
    const r = verifyInitData(signed(), TOKEN, NOW);
    expect(r).toEqual({ ok: true, user: { id: 11, first_name: "Huc", username: "huc06" } });
  });

  it("rejects forged and stale initData", () => {
    const tampered = signed().replace(encodeURIComponent('"id":11'), encodeURIComponent('"id":12'));
    expect(verifyInitData(tampered, TOKEN, NOW).ok).toBe(false);
    expect(verifyInitData(signed(), "999:OtherBotToken", NOW).ok).toBe(false);
    const noHash = new URLSearchParams(signed());
    noHash.delete("hash");
    expect(verifyInitData(noHash.toString(), TOKEN, NOW).ok).toBe(false);
    expect(verifyInitData(signed({ auth_date: String(NOW - 86_401) }), TOKEN, NOW).ok).toBe(false);
    expect(verifyInitData("", TOKEN, NOW).ok).toBe(false);
  });

  it("rejects signed data without a user", () => {
    const s = signInitData({ query_id: "AAE1", auth_date: String(NOW) }, TOKEN);
    expect(verifyInitData(s, TOKEN, NOW).ok).toBe(false);
  });
});

describe("Mini App links and payloads", () => {
  it("round-trips the three modes", () => {
    expect(parsePayload("j_abcdefgh23")).toEqual({ mode: "join", ref: "abcdefgh23" });
    expect(parsePayload("v_abcdefgh23_7")).toEqual({ mode: "vote", ref: "abcdefgh23", id: 7 });
    expect(parsePayload("c_abcdefgh23")).toEqual({ mode: "chip", ref: "abcdefgh23" });
  });

  it.each(["", "x_abcdefgh23", "j_short", "v_abcdefgh23", "v_abcdefgh23_x", "j_ABCDEFGH23", "j_abcdefgh23_1"])("rejects %j", (p) =>
    expect(parsePayload(p)).toBeNull(),
  );

  it("uses a t.me direct link when the Mini App is registered, else a plain web link", () => {
    expect(miniAppLink({ botUsername: "commons_near_bot", appShortName: "app", appUrl: "https://x.test", payload: "j_abcdefgh23" })).toBe(
      "https://t.me/commons_near_bot/app?startapp=j_abcdefgh23",
    );
    expect(miniAppLink({ botUsername: "", appShortName: "", appUrl: "https://x.test", payload: "j_abcdefgh23" })).toBe("https://x.test/app?p=j_abcdefgh23");
  });

  it("without a registered Mini App, sends people to the bot's private chat with the payload", () => {
    expect(miniAppLink({ botUsername: "commons_near_bot", appShortName: "", appUrl: "https://x.test", payload: "v_abcdefgh23_4" })).toBe(
      "https://t.me/commons_near_bot?start=v_abcdefgh23_4",
    );
  });
});
