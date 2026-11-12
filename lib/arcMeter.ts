// Geometry of the vote meter: the logo's C split into one arc per council member. The opening faces right, like the
// mark; arcs run from just above the opening, over the top and round to just below it. Pure, so it is unit tested.

export type Arc = { start: number; end: number };

export const OPENING = 80; // degrees, the same mouth as the 3D mark
const MAX_GAP = 36;

/** One arc per seat, with equal gaps. Angles in degrees, counterclockwise from +x (screen right). */
export function arcSegments(seats: number, opening = OPENING): Arc[] {
  const n = Math.max(1, Math.floor(seats));
  const sweep = 360 - opening;
  // Gaps shrink as the council grows, so each arc stays at least as long as a gap.
  const gap = n === 1 ? 0 : Math.min(MAX_GAP, sweep / (2 * n - 1));
  const len = (sweep - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => {
    const start = opening / 2 + i * (len + gap);
    return { start, end: start + len };
  });
}

/** SVG path for an arc on a circle (y grows downward on screen, so counterclockwise uses sweep flag 0). */
export function arcPath(cx: number, cy: number, r: number, a: Arc): string {
  const pt = (deg: number) => {
    const t = (deg * Math.PI) / 180;
    return `${(cx + r * Math.cos(t)).toFixed(2)} ${(cy - r * Math.sin(t)).toFixed(2)}`;
  };
  const large = a.end - a.start > 180 ? 1 : 0;
  return `M ${pt(a.start)} A ${r} ${r} 0 ${large} 0 ${pt(a.end)}`;
}

export type SeatState = "approve" | "reject" | "open";

/** Which arc shows what: approvals fill from the top, rejections from the bottom, the rest stay open. */
export function seatStates(seats: number, approvals: number, rejections: number): SeatState[] {
  const n = Math.max(1, Math.floor(seats));
  const a = Math.max(0, Math.min(n, approvals));
  const r = Math.max(0, Math.min(n - a, rejections));
  return Array.from({ length: n }, (_, i) => (i < a ? "approve" : i >= n - r ? "reject" : "open"));
}
