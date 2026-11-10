"use client";
// Loads the 3D vault only in the browser, after the page is interactive, and only where WebGL exists.
// Until then (or without WebGL) a static glow keeps the hero from looking empty.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const VaultScene = dynamic(() => import("./VaultScene.tsx"), { ssr: false, loading: () => null });

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
  useEffect(() => setOk(hasWebGL()), []);
  return (
    <div className="relative h-full w-full">
      <div className="vault-glow absolute inset-0" aria-hidden />
      {ok ? <VaultScene /> : null}
    </div>
  );
}
