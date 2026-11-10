import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin", "latin-ext", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const space = Space_Grotesk({ subsets: ["latin", "latin-ext", "vietnamese"], weight: ["500", "600", "700"], variable: "--font-space", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Commons · group money nobody has to hold",
  description: "A Telegram group treasury on NEAR. The money sits in a Sputnik DAO, every member holds their own key, and the bot can only propose.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${space.variable}`}>
      <body>{children}</body>
    </html>
  );
}
