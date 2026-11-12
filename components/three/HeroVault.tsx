"use client";
// Loads the 3D scene only in the browser, after the page is interactive, and only where WebGL exists.
// Until then (or without WebGL) a static glow keeps the hero from looking empty. A caption under the scene says what
// the scene is showing right now, so the animation reads as the product's story rather than decoration.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { BEATS } from "@/lib/heroStory.ts";

const VaultScene = dynamic(() => import("./VaultScene.tsx"), { ssr: false, loading: () => null });

const DOT = { bot: "bg-stone-400", ok: "bg-amber-300", pay: "bg-primary shadow-[0_0_10px_2px_rgb(245_158_11/0.7)]" };

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function HeroVault() {
  const [ok, setOk] = useState(false);
  const [beat, setBeat] = useState(-1);
  useEffect(() => setOk(hasWebGL()), []);
  const b = BEATS[beat];
  return (
    <div className="relative h-full w-full">
      <div className="vault-glow absolute inset-0" aria-hidden />
      {ok ? <VaultScene onBeat={setBeat} /> : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4 lg:bottom-10" aria-hidden>
        {b ? (
          <span key={beat} className="pill-nav msg-in inline-flex min-h-9 items-center gap-2 rounded-full px-4 text-xs text-fg sm:text-sm">
            <span className={`size-2 shrink-0 rounded-full ${DOT[b.tone]}`} />
            {b.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
