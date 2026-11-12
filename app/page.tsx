import ChatDemo from "@/components/ChatDemo.tsx";
import Reveal from "@/components/Reveal.tsx";
import HeroVault from "@/components/three/HeroVault.tsx";
import { ArcMeter } from "@/components/ArcMeter.tsx";
import { Icon } from "@/components/ui.tsx";
import { Logo } from "@/components/Logo.tsx";
import { NearMark, NearWordmark } from "@/components/NearLogo.tsx";
import { PROPOSER_ROLE, botIsProposerOnly, councilOf, votesNeeded } from "@/lib/near/policy.ts";
import { fmtNear } from "@/lib/pot.ts";
import { readChain } from "@/lib/server.ts";

// Live numbers come from the demo DAO on chain, refreshed every five minutes.
export const revalidate = 300;

const bot = process.env.TELEGRAM_BOT_USERNAME || "";
const demoDao = process.env.DEMO_DAO_ID || "";
const repo = "https://github.com/yukitran03/commons";
const explorer = "https://testnet.nearblocks.io";

// Transactions from the 2026-11-10 testnet run in which the contract refused the bot (docs/demo-run.log).
const REFUSED = [
  { what: "The bot tried to approve its own payment", hash: "768dnSErMV4LzugH8s6fgghxVerHi5m55CgmptSv7SM8" },
  { what: "The bot tried to rewrite the DAO's rules", hash: "G3Y4cxLAHg5MZjQKKirUbmVPbNBTQswrdrY9dqyfXUUK" },
];

async function liveStats(dao: string) {
  if (!dao) return null;
  try {
    const chain = readChain();
    const [policy, proposals, holds] = await Promise.all([chain.getPolicy(dao), chain.getProposals(dao), chain.balance(dao)]);
    const role = policy.roles.find((r) => r.name === PROPOSER_ROLE);
    const bots = role && typeof role.kind === "object" && "Group" in role.kind ? role.kind.Group : [];
    return {
      council: councilOf(policy).length,
      needed: votesNeeded(policy),
      paid: proposals.filter((p) => p.status === "Approved" && "Transfer" in p.kind).length,
      botVotes: proposals.reduce((n, p) => n + Object.keys(p.votes).filter((a) => bots.includes(a)).length, 0),
      botOk: bots.length > 0 && bots.every((b) => botIsProposerOnly(policy, b).ok),
      holds: fmtNear(holds),
    };
  } catch {
    return null;
  }
}

// The safety rules, written as the articles of the group's charter.
const articles = [
  { n: "I", title: "No single holder", body: "The money sits in a Sputnik DAO, the contract Trezu builds on. Not in a teammate's wallet." },
  { n: "II", title: "The bot cannot pay itself", body: "Its DAO role is proposer only. Whoever got hold of the bot's key could draft payments, and the contract would refuse everything else." },
  { n: "III", title: "Anyone can check", body: "The ledger reads the rules, votes and payments straight from the chain. So does npm run verify." },
];

// Today vs Commons, row by row.
const compare = [
  { q: "Where the money sits", before: "In one teammate's wallet", after: "In a Sputnik DAO the group owns" },
  { q: "Who can spend it", before: "Whoever holds that key, alone", after: "Only a majority of the council" },
  { q: "If the key or the bot is stolen", before: "The money goes with it", after: "The bot can only draft; the contract refuses the rest" },
  { q: "The record", before: "Screenshots and trust", after: "Every vote and payment on chain, in a public ledger" },
  { q: "Where it happens", before: "A wallet app, a bank, a spreadsheet", after: "The Telegram chat the group already uses" },
];

// What Commons is built with. Logos are the projects' own (public/tech, components/NearLogo.tsx); Sputnik DAO has no
// published logo, so it gets a plain glyph, as does near-api-js, which shares NEAR's.
type TechLogo = { near: true } | { src: string; inset?: boolean } | { glyph: "vote" | "key" };
const stack: { name: string; what: string; href: string; logo: TechLogo }[] = [
  { name: "NEAR Protocol", what: "every member is a named account, <name>.<sponsor>", href: "https://near.org", logo: { near: true } },
  { name: "Sputnik DAO v2", what: "holds the money and counts the votes", href: "https://github.com/near-daos/sputnik-dao-contract", logo: { glyph: "vote" } },
  { name: "NEAR Intents · 1Click", what: "chip in from Base, Arbitrum, Solana, Ethereum, Tron", href: "https://near-intents.org", logo: { src: "/tech/near-intents.png" } },
  { name: "near-api-js", what: "keys made and votes signed on the phone; the server only sees public keys", href: "https://github.com/near/near-api-js", logo: { glyph: "key" } },
  { name: "FastNEAR RPC", what: "reads the rules, votes and balances for the ledger and the Mini App", href: "https://fastnear.com", logo: { src: "/tech/fastnear.png" } },
  { name: "NearBlocks", what: "explorer links for every transaction", href: "https://testnet.nearblocks.io", logo: { src: "/tech/nearblocks.png" } },
  { name: "Telegram Mini App", what: "vote where the group already talks", href: "https://core.telegram.org/bots/webapps", logo: { src: "/tech/telegram.svg", inset: true } },
];

/** A logo on a small paper tile, so marks of different shapes and colours sit in one even column. */
function TechTile({ logo }: { logo: TechLogo }) {
  return (
    <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--slip)] text-[#000]" aria-hidden>
      {"near" in logo ? (
        <NearMark size={22} />
      ) : "glyph" in logo ? (
        <Icon name={logo.glyph} size={20} className="text-fg" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- tiny static logos
        <img src={logo.src} alt="" width={44} height={44} loading="lazy" className={logo.inset ? "size-6" : "size-full object-cover"} />
      )}
    </span>
  );
}

const HEADLINE = "Group money nobody has to hold.".split(" ");

/** Hero label with the brand's three-bar marker (the logo's arcs, unrolled). */
function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-link ${className}`}>
      <span className="seg" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {children}
    </p>
  );
}

/** A clause number in the group's book, with a rule running to the edge. */
function Mark({ n, children, id, as: Tag = "p" }: { n: number; children: React.ReactNode; id?: string; as?: "p" | "h2" }) {
  return (
    <Tag id={id} className="section-mark">
      <b>§&#8239;{n}</b>
      {children}
    </Tag>
  );
}

const printedAt = () =>
  new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }) + " UTC";

export default async function Home() {
  const stats = await liveStats(demoDao);
  return (
    <main className="immersive min-h-dvh overflow-x-clip">
      <nav className="pill-nav fixed left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full p-1.5 text-sm" aria-label="Main">
        <a href="#top" className="flex min-h-11 items-center gap-2 rounded-full px-3 font-semibold">
          <Logo size={28} />
          Commons
        </a>
        <a href="#how" className="hidden min-h-11 items-center rounded-full px-3 text-muted transition-colors duration-200 hover:text-fg sm:flex">
          How it works
        </a>
        <a href="#compare" className="hidden min-h-11 items-center rounded-full px-3 text-muted transition-colors duration-200 hover:text-fg md:flex">
          Why
        </a>
        <a href="#safety" className="hidden min-h-11 items-center rounded-full px-3 text-muted transition-colors duration-200 hover:text-fg sm:flex">
          Safety
        </a>
        {demoDao ? (
          <a href={`/c/${demoDao}`} className="flex min-h-11 items-center rounded-full px-3 text-muted transition-colors duration-200 hover:text-fg">
            Ledger
          </a>
        ) : null}
      </nav>

      <section id="top" className="grain relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl content-center items-center gap-2 px-4 pb-10 pt-28 sm:px-6 lg:min-h-[100svh] lg:grid-cols-[1.05fr_1fr] lg:pb-20 lg:pt-16">
          <div className="relative z-10">
            <div className="rise" style={{ ["--i" as string]: 0 }}>
              <Eyebrow className="sm:text-sm">Telegram group treasury on NEAR</Eyebrow>
            </div>
            <h1 className="font-display mt-5 text-[2.75rem] font-medium leading-[1] sm:text-6xl lg:text-[5.2rem]">
              {HEADLINE.map((w, i) => (
                <span key={i} className="rise rise-word mr-[0.22em]" style={{ ["--i" as string]: i + 1 }}>
                  {w === "nobody" ? <em className="text-gold-sheen pr-[0.04em] italic">{w}</em> : w}
                </span>
              ))}
            </h1>
            <p className="rise mt-6 max-w-xl text-lg leading-relaxed text-muted" style={{ ["--i" as string]: 7 }}>
              Prize money, event budgets, a team&apos;s shared fund. Today it sits in one person&apos;s wallet and everyone trusts them. Commons keeps it in a NEAR treasury the whole
              group owns, right inside your Telegram chat.
            </p>
            <div className="rise mt-8 flex flex-wrap gap-3" style={{ ["--i" as string]: 8 }}>
              {bot ? (
                <a href={`https://t.me/${bot}?startgroup=commons`} className="btn-gold inline-flex min-h-12 items-center gap-2 rounded-full px-6 font-semibold">
                  <Icon name="send" size={18} /> Add to a Telegram group
                </a>
              ) : null}
              {demoDao ? (
                <a href={`/c/${demoDao}`} className="btn-ghost inline-flex min-h-12 items-center gap-2 rounded-full px-6 font-medium">
                  See a live ledger <Icon name="external" size={16} />
                </a>
              ) : null}
            </div>
            <a
              href="https://near.org"
              className="rise mt-7 inline-flex min-h-11 items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted transition-colors duration-200 hover:text-fg"
              style={{ ["--i" as string]: 9 }}
            >
              Built on <NearWordmark height={15} className="text-white" />
            </a>
            <ul className="rise mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" style={{ ["--i" as string]: 10 }} aria-label="What the scene shows">
              <li className="flex items-center gap-2">
                <span className="h-1 w-4 rounded-full bg-gradient-to-r from-amber-200 to-amber-500" /> The council&apos;s keys
              </li>
              <li className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_2px_rgb(255_138_0/0.6)]" /> The pot
              </li>
              <li className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-gradient-to-br from-stone-200 to-stone-500" /> The bot, proposer only
              </li>
            </ul>
          </div>
          <div className="relative -mx-4 h-[380px] sm:h-[460px] lg:mx-0 lg:h-[640px]">
            <HeroVault />
          </div>
        </div>
      </section>

      {/* Below the hero the page is the group's book: a sheet of paper laid on the dark desk. */}
      <div className="paper sheet tear-bottom mx-1.5 sm:mx-3 lg:mx-5">
        {stats ? (
          <section aria-labelledby="books" className="mx-auto grid max-w-6xl items-start gap-12 px-5 pb-16 pt-16 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:pb-24 lg:pt-24">
            <Reveal>
              <Mark n={0}>The books, live</Mark>
              <h2 id="books" className="font-display mt-6 text-4xl font-medium leading-[1.04] sm:text-6xl">
                Every payment, <em className="italic">on the record.</em>
              </h2>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
                This receipt is printed from the demo group&apos;s DAO on NEAR testnet and refreshed every five minutes. It needs{" "}
                <span className="marker text-fg">
                  {stats.needed} of {stats.council} council signatures
                </span>{" "}
                to move a coin, and the bot has none to give.
              </p>
              <div className="mt-8 flex items-center gap-5">
                <ArcMeter seats={stats.council} approvals={stats.needed} needed={stats.needed} size={84} className="text-fg" />
                <p className="max-w-xs text-sm leading-relaxed text-muted">
                  The mark is the vote meter. Each arc is a council member&apos;s key; when a majority lights up, the pot pays.
                </p>
              </div>
              <a href={`/c/${demoDao}`} className="mt-8 inline-flex min-h-11 items-center gap-2 font-medium text-link underline decoration-1 underline-offset-4 hover:decoration-2">
                Open the full ledger <Icon name="external" size={16} />
              </a>
            </Reveal>

            <Reveal className="mx-auto w-full max-w-[360px] lg:mt-6">
              <div className="printer">
                <div className="receipt rotate-[1.2deg] px-6 pb-6 pt-7 text-[13px] leading-relaxed">
                  <div className="text-center">
                    <div className="font-display text-2xl font-semibold tracking-tight not-italic">Commons</div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-[0.2em] text-[#5f5548]">Demo pot · NEAR testnet</div>
                    <div className="mt-2 break-all text-[11px] text-[#5f5548]">{demoDao}</div>
                  </div>
                  <div className="my-4 border-t border-dashed border-[#1c1710]/40" />
                  <dl className="space-y-1.5">
                    {[
                      ["Payments made", String(stats.paid)],
                      ["Approvals needed", `${stats.needed} of ${stats.council}`],
                      ["Votes cast by the bot", String(stats.botVotes)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-baseline gap-2">
                        <dt>{k}</dt>
                        <span className="dots" aria-hidden />
                        <dd className="tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="my-4 border-t border-dashed border-[#1c1710]/40" />
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] uppercase tracking-[0.2em]">In the pot</span>
                    <span className="double-under text-xl font-medium tabular-nums">{stats.holds}</span>
                  </div>
                  {stats.botOk ? (
                    <div className="mt-6 text-center">
                      <span className="stamp thud text-[12px] text-[#17694a]" style={{ ["--r" as string]: "-6deg", ["--d" as string]: "2.2s" }}>
                        <Icon name="check" size={14} /> Bot: proposer only
                      </span>
                    </div>
                  ) : null}
                  <div className="barcode mt-6" aria-hidden />
                  <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-[10.5px] uppercase tracking-[0.14em] text-[#5f5548]">
                    <span>Read from chain</span>
                    <span>{printedAt()}</span>
                  </div>
                </div>
              </div>
            </Reveal>
          </section>
        ) : null}

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-14 sm:px-8 lg:py-20">
          <Reveal>
            <Mark n={1}>How it works</Mark>
            <h2 className="font-display mt-6 max-w-3xl text-4xl font-medium leading-[1.05] sm:text-5xl">
              From a chat message to a payment, <em className="italic">with the group in charge.</em>
            </h2>
          </Reveal>
          <Reveal className="mt-12">
            <ChatDemo />
          </Reveal>
        </section>

        <section id="compare" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-14 sm:px-8 lg:py-20">
          <Reveal>
            <Mark n={2}>Why it matters</Mark>
            <h2 className="font-display mt-6 max-w-3xl text-4xl font-medium leading-[1.05] sm:text-5xl">
              Today, <span className="marker">one person</span> holds the group&apos;s money.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
              Hackathon prizes are paid in one payment to one account. Event budgets and club funds work the same way. Everyone else trusts that person to pay them back.
            </p>
          </Reveal>
          <Reveal className="mt-12">
            <div className="ledger-lines border-y-2 border-[var(--rule-strong)] bg-[rgb(255_253_248/0.55)]">
              <div className="hidden grid-cols-[0.8fr_1fr_1fr] border-b border-[var(--rule-strong)] py-3 pl-14 pr-5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted sm:grid">
                <span>Entry</span>
                <span>One wallet</span>
                <span className="flex items-center gap-2 text-fg">
                  <Logo size={18} /> Commons
                </span>
              </div>
              {compare.map((r, i) => (
                <div key={r.q} className="grid gap-x-6 gap-y-1.5 border-b border-[var(--rule)] py-4 pl-14 pr-5 last:border-b-0 sm:grid-cols-[0.8fr_1fr_1fr] sm:py-5">
                  <div className="font-display text-lg italic leading-snug">{r.q}</div>
                  <div className="flex gap-2.5 text-muted">
                    <Icon name="x" size={16} className="mt-1 shrink-0 text-bad" />
                    <span>
                      <span className="sr-only">One wallet: </span>
                      {r.before}
                    </span>
                  </div>
                  <div className="flex gap-2.5">
                    <Icon name="check" size={16} className="mt-1 shrink-0 text-ok" />
                    <span>
                      <span className="sr-only">Commons: </span>
                      <span className="marker" style={{ ["--d" as string]: `${400 + i * 160}ms` }}>
                        {r.after}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        <section id="safety" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-14 sm:px-8 lg:py-20">
          <Reveal>
            <Mark n={3}>Safety</Mark>
            <h2 className="font-display mt-6 text-4xl font-medium leading-[1.05] sm:text-5xl">
              Why the money is safe<span className="text-link">.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">Three rules, written into the contract rather than promised by us.</p>
          </Reveal>
          <Reveal className="mt-12">
            <ol className="charter grid bg-[rgb(255_253_248/0.6)] p-3 sm:grid-cols-3">
              {articles.map((a) => (
                <li key={a.n} className="border-[var(--rule)] p-6 max-sm:[&:not(:last-child)]:border-b sm:p-8 sm:[&:not(:last-child)]:border-r">
                  <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Article</div>
                  <div className="foil font-display text-6xl font-semibold leading-none">{a.n}</div>
                  <h3 className="font-display mt-5 text-2xl font-medium">{a.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted">{a.body}</p>
                </li>
              ))}
            </ol>
          </Reveal>

          <div className="mt-20 grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
            <Reveal>
              <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-bad">
                <Icon name="alert" size={14} /> Incident report
              </p>
              <h3 className="font-display mt-4 text-3xl font-medium leading-tight sm:text-4xl">We attacked our own bot on testnet.</h3>
              <p className="mt-4 max-w-lg leading-relaxed text-muted">
                With the bot&apos;s key in hand we drafted &quot;send everything to the bot&quot;, then tried to approve it and to rewrite the rules. The contract refused both with{" "}
                <span className="font-mono text-[0.9em] text-fg">ERR_PERMISSION_DENIED</span>. The pot kept its money.
              </p>
            </Reveal>
            <Reveal>
              <ul className="space-y-5">
                {REFUSED.map((r, i) => (
                  <li key={r.hash} className={`slip-shadow ${i ? "lg:ml-10 rotate-[0.8deg]" : "rotate-[-1deg]"}`}>
                    <a href={`${explorer}/txns/${r.hash}`} className="slip group relative block py-5 pl-8 pr-5 transition-transform duration-200 hover:-translate-y-0.5">
                      <div className="pr-28 sm:pr-36">
                        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Testnet tx · {r.hash.slice(0, 8)}…</div>
                        <div className="font-display mt-2 text-xl leading-snug">{r.what}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-mono text-xs text-bad">ERR_PERMISSION_DENIED</span>
                          <span className="inline-flex items-center gap-1 text-sm text-link group-hover:underline">
                            Explorer <Icon name="external" size={14} />
                          </span>
                        </div>
                      </div>
                      <span
                        className="stamp thud absolute right-4 top-1/2 -translate-y-1/2 text-base text-bad sm:right-6 sm:text-lg"
                        style={{ ["--r" as string]: i ? "-12deg" : "-6deg", ["--d" as string]: `${0.5 + i * 0.35}s` }}
                        aria-hidden
                      >
                        Denied
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24 pt-16 sm:px-8" aria-labelledby="stack">
          <Reveal>
            <Mark n={4} as="h2" id="stack">
              Built on NEAR
            </Mark>
            <div className="mt-8 flex max-w-4xl flex-wrap items-end justify-between gap-x-10 gap-y-5">
              <a href="https://near.org" className="block text-[#000]" aria-label="NEAR">
                <NearWordmark height={64} className="h-12 w-auto sm:h-16" />
              </a>
              <p className="max-w-sm leading-relaxed text-muted">The money, the rules and every vote live on NEAR. Telegram is only where the group talks.</p>
            </div>
          </Reveal>
          <Reveal className="mt-10">
            <ul className="max-w-4xl border-t border-[var(--rule-strong)]">
              {stack.map((x) => (
                <li key={x.name} className="flex items-center gap-4 border-b border-[var(--rule)] py-4">
                  <TechTile logo={x.logo} />
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <a href={x.href} className="font-display text-xl font-medium decoration-1 underline-offset-4 hover:underline">
                      {x.name}
                    </a>
                    <span className="dots hidden sm:block" aria-hidden />
                    <span className="w-full text-sm text-muted sm:w-auto sm:text-right">{x.what}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>
      </div>

      <section className="grain relative overflow-hidden">
        <div className="ember pointer-events-none absolute left-1/2 top-16 size-[420px] -translate-x-1/2" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-24 text-center sm:px-6">
          <Reveal>
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand render */}
            <img src="/brand/mark-512.png" alt="" width={144} height={144} loading="lazy" className="float mx-auto mb-8 size-28 rounded-[30%] shadow-[0_30px_80px_-30px_rgb(255_138_0/0.8)] sm:size-36" />
            <h2 className="font-display mx-auto max-w-2xl text-4xl font-medium sm:text-6xl">
              Try it with <em className="text-gold italic">your group</em>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-muted">
              Add the bot to a Telegram group and send <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-fg">/commons</span>. It runs on NEAR testnet, so nothing real is at
              stake.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {bot ? (
                <a href={`https://t.me/${bot}?startgroup=commons`} className="btn-gold inline-flex min-h-12 items-center gap-2 rounded-full px-6 font-semibold">
                  <Icon name="send" size={18} /> Add @{bot}
                </a>
              ) : null}
              <a href={repo} className="btn-ghost inline-flex min-h-12 items-center gap-2 rounded-full px-6 font-medium">
                Read the code <Icon name="external" size={16} />
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:px-6">
          <span className="flex items-center gap-2">
            <Logo size={24} /> Built for the NEAR Hackathon 2026. Runs on NEAR testnet. MIT license.
          </span>
          <a href="https://near.org" className="inline-flex min-h-11 items-center gap-2 font-mono transition-colors duration-200 hover:text-fg">
            Built on <NearWordmark height={13} className="text-white" />
          </a>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-6 text-[11px] text-muted/80 sm:px-6">
          NEAR, NEAR Intents, FastNEAR, NearBlocks and Telegram names and logos belong to their owners and are shown here only to say what Commons is built with.
        </p>
      </footer>
    </main>
  );
}
