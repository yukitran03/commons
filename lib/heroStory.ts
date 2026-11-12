// The story the landing page's 3D scene tells, one beat at a time. The scene (components/three/VaultScene.tsx)
// animates it and the caption (components/three/HeroVault.tsx) names it, so both read from here.

export const PERIOD = 7.2; // seconds per proposal cycle

/** The arcs that approve, in order: two of the three council members, a majority. */
export const APPROVERS = [2, 1] as const;

export const BEATS: { text: string; tone: "bot" | "ok" | "pay" }[] = [
  { text: "The bot drafts a payment. That is all it can do.", tone: "bot" },
  { text: `Approval 1 of ${APPROVERS.length}, signed on a member's own phone`, tone: "ok" },
  { text: `Approval ${APPROVERS.length} of ${APPROVERS.length}: a majority of the council`, tone: "ok" },
  { text: "The contract pays, out through the opening", tone: "pay" },
  { text: "The bot never touched the money", tone: "bot" },
];

/** Which beat is on screen at this point of the cycle (seconds since the cycle started). */
export function beatAt(phase: number): number {
  if (phase < 1.4) return 0; // the proposal flies in and stops at the ring
  if (phase < 2.1) return 1; // first approval
  if (phase < 2.9) return 2; // second approval: majority
  if (phase < 4.6) return 3; // the core flares and pays
  return 4; // back to rest
}
