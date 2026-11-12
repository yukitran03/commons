// The favicon is drawn from lib/brand.ts, the same geometry as the 3D render in public/brand; this keeps them in step.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND } from "../lib/brand.ts";

const files = ["app/icon.svg"];

describe("brand mark", () => {
  for (const f of files) {
    it(`${f} draws the same ring and core as lib/brand.ts`, () => {
      const svg = readFileSync(f, "utf8");
      for (const d of BRAND.arcs) expect(svg).toContain(`d="${d}"`);
      expect(svg).toContain(`cx="${BRAND.core.cx}" cy="${BRAND.core.cy}" r="${BRAND.core.r}"`);
      expect(svg).toContain(`stroke-width="${BRAND.stroke}"`);
    });

    it(`${f} is self-contained (no scripts, no external references)`, () => {
      const svg = readFileSync(f, "utf8");
      expect(svg).not.toMatch(/<script|href=|xlink:|https?:\/\/(?!www\.w3\.org)/);
    });
  }

  it("the gaps between arcs stay open at 16 px and the C's opening is clearly the widest gap", () => {
    const xy = (s: string) => s.split(" ").map(Number);
    const starts = BRAND.arcs.map((d) => xy(/^M([\d.]+ [\d.]+)/.exec(d)![1]));
    const ends = BRAND.arcs.map((d) => xy(/([\d.]+ [\d.]+)$/.exec(d)![1]));
    const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // round caps eat half a stroke on each side, so the visible gap is the chord minus one stroke
    const inner = [dist(ends[0], starts[1]), dist(ends[1], starts[2])].map((c) => c - BRAND.stroke);
    const opening = dist(ends[2], starts[0]) - BRAND.stroke;
    for (const g of inner) expect(g).toBeGreaterThanOrEqual(0.75 * BRAND.stroke);
    expect(opening).toBeGreaterThan(1.5 * Math.max(...inner)); // equal gaps would read as the radiation symbol
  });

  it("the three arcs leave a gap on the right, so the ring reads as a C", () => {
    const starts = BRAND.arcs.map((d) => /^M([\d.]+) ([\d.]+)/.exec(d)!.slice(1).map(Number));
    const ends = BRAND.arcs.map((d) => /([\d.]+) ([\d.]+)$/.exec(d)!.slice(1).map(Number));
    // the C opens between the end of the last arc (upper right) and the start of the first (lower right)
    expect(ends[2][0]).toBeGreaterThan(40);
    expect(starts[0][0]).toBeGreaterThan(40);
    expect(ends[2][1]).toBeLessThan(BRAND.core.cy);
    expect(starts[0][1]).toBeGreaterThan(BRAND.core.cy);
  });
});
