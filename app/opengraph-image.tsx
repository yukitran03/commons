// The link preview for X, Telegram and Slack: the pitch in one line and the rule that makes it safe.
import { ImageResponse } from "next/og";

export const alt = "Commons: group money nobody has to hold. A Telegram group treasury on NEAR where the bot can only propose.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const keys = [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return { x: 160 + Math.cos(a) * 120, y: 160 + Math.sin(a) * 120, ok: i !== 1 && i !== 4 };
  });
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "radial-gradient(circle at 78% 50%, #3a2606 0%, #05070b 55%)",
          color: "#f1f5f9",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 700 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0b0f17" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            Commons
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2, display: "flex", flexWrap: "wrap" }}>
              <span>Group money&nbsp;</span>
              <span style={{ color: "#f59e0b" }}>nobody</span>
              <span>&nbsp;has to hold.</span>
            </div>
            <div style={{ marginTop: 28, fontSize: 30, color: "#94a3b8", lineHeight: 1.35 }}>
              A Telegram group treasury on NEAR. Members hold the keys. The bot can only propose.
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 22, color: "#cbd5e1" }}>
            {["Sputnik DAO", "Named accounts", "NEAR Intents"].map((t) => (
              <div key={t} style={{ display: "flex", padding: "8px 18px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)" }}>
                {t}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", position: "relative", width: 320, height: 320, marginLeft: 48, marginTop: 90 }}>
          <div style={{ position: "absolute", left: 40, top: 40, width: 240, height: 240, borderRadius: 999, border: "2px solid rgba(245,158,11,0.25)" }} />
          <div
            style={{
              position: "absolute",
              left: 110,
              top: 110,
              width: 100,
              height: 100,
              borderRadius: 999,
              background: "radial-gradient(circle, #fbbf24 0%, #f59e0b 45%, rgba(245,158,11,0) 75%)",
            }}
          />
          {keys.map((k, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: k.x - 18,
                top: k.y - 18,
                width: 36,
                height: 36,
                transform: "rotate(45deg)",
                borderRadius: 6,
                background: k.ok ? "#34d399" : "#f59e0b",
              }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
