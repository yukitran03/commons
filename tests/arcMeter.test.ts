import { describe, expect, it } from "vitest";
import { OPENING, arcPath, arcSegments, seatStates } from "../lib/arcMeter.ts";

describe("vote meter geometry", () => {
  it("splits the C into one arc per seat, inside the opening, in order", () => {
    for (const n of [1, 2, 3, 5, 9, 25]) {
      const arcs = arcSegments(n);
      expect(arcs).toHaveLength(n);
      expect(arcs[0].start).toBeCloseTo(OPENING / 2);
      expect(arcs.at(-1)!.end).toBeCloseTo(360 - OPENING / 2);
      for (let i = 0; i < n; i++) {
        expect(arcs[i].end).toBeGreaterThan(arcs[i].start);
        if (i) expect(arcs[i].start).toBeGreaterThan(arcs[i - 1].end);
      }
    }
  });

  it("keeps every arc at least as long as a gap, so a big council still reads as arcs, not dots", () => {
    for (const n of [2, 3, 7, 25]) {
      const arcs = arcSegments(n);
      const len = arcs[0].end - arcs[0].start;
      const gap = arcs[1].start - arcs[0].end;
      expect(len).toBeGreaterThanOrEqual(gap - 1e-9);
    }
  });

  it("the opening stays wider than the gaps between arcs, so the mark reads as a C", () => {
    const arcs = arcSegments(3);
    expect(OPENING).toBeGreaterThan((arcs[1].start - arcs[0].end) * 1.5);
  });

  it("draws arcs over the top first: the first arc starts above the opening on the right", () => {
    const d = arcPath(32, 32, 21, arcSegments(3)[0]);
    const [, x, y] = d.match(/^M ([\d.]+) ([\d.]+)/)!.map(Number);
    expect(x).toBeGreaterThan(32);
    expect(y).toBeLessThan(32);
  });

  it("fills approvals from the top and rejections from the bottom, never more than the seats", () => {
    expect(seatStates(3, 2, 0)).toEqual(["approve", "approve", "open"]);
    expect(seatStates(3, 1, 1)).toEqual(["approve", "open", "reject"]);
    expect(seatStates(3, 3, 2)).toEqual(["approve", "approve", "approve"]);
    expect(seatStates(4, 0, 9)).toEqual(["reject", "reject", "reject", "reject"]);
    expect(seatStates(0, 0, 0)).toEqual(["open"]);
  });
});
