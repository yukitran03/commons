import { describe, expect, it } from "vitest";
import { BOT_DESCRIPTION, BOT_SHORT_DESCRIPTION } from "../lib/bot/copy.ts";

describe("bot profile text", () => {
  it("fits Telegram's limits (512 and 120 characters)", () => {
    expect(BOT_DESCRIPTION.length).toBeLessThanOrEqual(512);
    expect(BOT_SHORT_DESCRIPTION.length).toBeLessThanOrEqual(120);
  });

  it("says the bot cannot move money", () => {
    expect(BOT_DESCRIPTION).toMatch(/cannot vote or move money/);
    expect(BOT_SHORT_DESCRIPTION).toMatch(/majority/);
  });
});
