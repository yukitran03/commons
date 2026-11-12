// The Commons logo: a 3D render of the mark (three gold arcs, one per keyholder, closing a C around the glowing pot).
// Below 24 px the 3D detail turns to mush, so small logos use the flat cut drawn for that size (app/icon.svg).
export function Logo({ size = 24, className = "", title }: { size?: number; className?: string; title?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a tiny static icon; the image optimizer adds nothing here
    <img
      src={size < 24 ? "/icon.svg" : "/brand/mark-192.png"}
      width={size}
      height={size}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      decoding="async"
      className={`shrink-0 rounded-[24%] shadow-[0_0_0_1px_rgba(245,158,11,0.22)] ${className}`}
    />
  );
}
