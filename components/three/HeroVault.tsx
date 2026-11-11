"use client";
// Loads the 3D vault only in the browser, after the page is interactive, and only where WebGL exists.
// Until then (or without WebGL) a static glow keeps the hero from looking empty. A caption under the scene says what
// the scene is showing right now, so the animation reads as the product's story rather than decoration.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const VaultScene = dynamic(() => import("./VaultScene.tsx"), { ssr: false, loading: () => null });

const BEATS: { text: string; tone: "bot" | "ok" | "pay" }[] = [
  { text: "The bot drafts a payment. That is all it can do.", tone: "bot" },
  { text: "Approval 1 of 3, signed on a member's own phone", tone: "ok" },
  { text: "Approval 2 of 3", tone: "ok" },
  { text: "Approval 3 of 3: a majority of the council", tone: "ok" },
  { text: "The contract pays the member", tone: "pay" },
  { text: "The bot never touched the money", tone: "bot" },
];
const DOT = { bot: "bg-slate-400", ok: "bg-ok", pay: "bg-primary" };

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
