"use client";
// Counts the first number in `value` up from zero when it scrolls into view. The server renders the final value, so
// crawlers, no-JS readers and reduced-motion users always see the real number.
import { useEffect, useRef, useState } from "react";

export default function CountUp({ value, ms = 1100 }: { value: string; ms?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const m = /\d+(?:\.\d+)?/.exec(value);
    const node = el.current;
    if (!m || !node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = Number(m[0]);
    const decimals = m[0].split(".")[1]?.length ?? 0;
    const render = (n: number) => value.slice(0, m.index) + n.toFixed(decimals) + value.slice(m.index + m[0].length);
    if (node.getBoundingClientRect().top < window.innerHeight) return; // already on screen: keep the real number
    setShown(render(0));
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        setShown(render(target * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, ms]);
  return (
    <span ref={el} aria-label={value}>
      {shown}
    </span>
  );
}
