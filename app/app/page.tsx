import Script from "next/script";
import type { Metadata } from "next";
import MiniApp from "./MiniApp.tsx";

export const metadata: Metadata = { title: "Commons" };

export default function Page() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js?59" strategy="beforeInteractive" />
      <MiniApp />
    </>
  );
}
