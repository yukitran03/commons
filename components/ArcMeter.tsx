// The vote meter is the logo: one satin-gold arc per council member closing a C around the pot. Approvals light arcs
// from the top, rejections mark arcs red from the bottom, and the core glows once enough members have approved.
// No hooks, so it renders on the server (ledger, landing) and in the Mini App alike.
import { arcPath, arcSegments, seatStates } from "@/lib/arcMeter.ts";

export function ArcMeter({
  seats,
  approvals,
  rejections = 0,
  needed,
  size = 56,
  className = "",
}: {
  seats: number;
  approvals: number;
  rejections?: number;
  needed: number;
  size?: number;
  className?: string;
}) {
  const arcs = arcSegments(seats);
  const states = seatStates(seats, approvals, rejections);
  const w = seats > 5 ? 5.5 : 7;
  const lit = approvals >= needed && needed > 0;
  const label = `${approvals} of ${needed} approvals${rejections ? `, ${rejections} rejected` : ""}, council of ${seats}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label} className={`shrink-0 ${className}`}>
      {arcs.map((a, i) => {
        const d = arcPath(32, 32, 21, a);
        const s = states[i];
        if (s === "open") return <path key={i} d={d} fill="none" stroke="currentColor" strokeOpacity={0.16} strokeWidth={w} strokeLinecap="round" />;
        if (s === "reject") return <path key={i} d={d} fill="none" stroke="var(--c-bad)" strokeWidth={w} strokeLinecap="round" />;
        // Satin tube: a dark base, a gold body and a thin highlight down the middle, like the 3D mark's arcs.
        return (
          <g key={i} fill="none" strokeLinecap="round">
            <path d={d} stroke="#b8730a" strokeWidth={w} />
            <path d={d} stroke="#f2ad25" strokeWidth={w * 0.62} />
            <path d={d} stroke="#fff1c4" strokeOpacity={0.85} strokeWidth={w * 0.2} />
          </g>
        );
      })}
      {lit ? (
        <g>
          <circle cx={33} cy={32} r={11} fill="#ff9f0a" opacity={0.22} />
          <circle cx={33} cy={32} r={6.6} fill="#ff9f0a" />
          <circle cx={31.4} cy={30.4} r={2.2} fill="#ffe6a8" opacity={0.9} />
        </g>
      ) : (
        <circle cx={33} cy={32} r={6.2} fill="currentColor" opacity={0.14} />
      )}
    </svg>
  );
}
