import { Icon } from "@/components/ui.tsx";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="immersive grain relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <div className="vault-glow pointer-events-none absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 opacity-70" aria-hidden />
      <div className="relative max-w-md text-center">
        <p className="font-display text-7xl font-semibold text-primary">404</p>
        <h1 className="font-display mt-4 text-2xl font-semibold">Nothing here</h1>
        <p className="mt-3 text-muted">This page does not exist, or this account is not a Sputnik DAO on this network.</p>
        <a href="/" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-on-primary">
          <Icon name="shield" size={18} /> Back to Commons
        </a>
      </div>
    </main>
  );
}
