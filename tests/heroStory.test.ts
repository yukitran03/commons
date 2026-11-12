import { describe, expect, it } from "vitest";
import { APPROVERS, BEATS, PERIOD, beatAt } from "../lib/heroStory.ts";

describe("hero story", () => {
  it("walks through every caption once per cycle, in order", () => {
    const seen: number[] = [];
    for (let t = 0; t < PERIOD; t += 0.02) {
      const b = beatAt(t);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(BEATS.length);
      if (seen.at(-1) !== b) seen.push(b);
    }
    expect(seen).toEqual(BEATS.map((_, i) => i));
  });

  it("a majority of the three arcs approves, and the captions count the same approvals", () => {
    expect(APPROVERS.length).toBe(2);
    expect(new Set(APPROVERS).size).toBe(APPROVERS.length);
    for (const a of APPROVERS) expect([0, 1, 2]).toContain(a);
    expect(BEATS.filter((b) => b.tone === "ok").map((b) => b.text)).toEqual([
      `Approval 1 of ${APPROVERS.length}, signed on a member's own phone`,
      `Approval ${APPROVERS.length} of ${APPROVERS.length}: a majority of the council`,
    ]);
  });
});
