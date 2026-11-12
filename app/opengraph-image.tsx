// The link preview for X, Telegram and Slack: the pitch in one line, the rule that makes it safe, and the 3D mark.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Commons: group money nobody has to hold. A Telegram group treasury on NEAR where the bot can only propose.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const mark = `data:image/png;base64,${readFileSync(join(process.cwd(), "public/brand/mark-512.png")).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "radial-gradient(circle at 80% 50%, #2a1a06 0%, #05070b 52%)",
          color: "#f1f5f9",
          padding: "64px 0 64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 700 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
            <img src={mark} width={52} height={52} style={{ borderRadius: 13 }} />
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 428 }}>
          <img src={mark} width={400} height={400} style={{ borderRadius: 200 }} />
        </div>
      </div>
    ),
    size,
  );
}
