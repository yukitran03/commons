"use client";
// Fades children in once they scroll into view. With reduced motion (or no JS) they are simply shown.
import { useEffect, useRef, type ReactNode } from "react";

export default function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    node.dataset.reveal = "pending";
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          node.dataset.reveal = "shown";
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={el} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
