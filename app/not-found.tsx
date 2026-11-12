import { Logo } from "@/components/Logo.tsx";

export const metadata = { title: "Not found" };

// A slip of the group's book on the dark desk, stamped "not found".
export default function NotFound() {
  return (
    <main className="immersive grain relative grid min-h-dvh place-items-center overflow-hidden px-4 py-16">
      <div className="ember pointer-events-none absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 opacity-60" aria-hidden />
      <div className="slip-shadow relative w-full max-w-md rotate-[-1.5deg]">
        <div className="paper slip relative px-8 pb-8 pt-7 sm:px-10">
          <p className="section-mark">
            <b>§&#8239;404</b> Not in the book
          </p>
          <h1 className="font-display mt-6 text-4xl font-medium leading-tight">Nothing here</h1>
          <p className="mt-3 leading-relaxed text-muted">This page does not exist, or this account is not a Sputnik DAO on this network.</p>
          <a href="/" className="btn-gold mt-8 inline-flex min-h-12 items-center gap-2 rounded-full px-6 font-semibold">
            <Logo size={24} /> Back to Commons
          </a>
          <span className="stamp absolute right-6 top-6 text-sm text-bad" style={{ ["--r" as string]: "8deg" }} aria-hidden>
            Not found
          </span>
        </div>
      </div>
    </main>
  );
}
