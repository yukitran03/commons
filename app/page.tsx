import ChatDemo from "@/components/ChatDemo.tsx";
import CountUp from "@/components/CountUp.tsx";
import Reveal from "@/components/Reveal.tsx";
import Spotlight from "@/components/Spotlight.tsx";
import HeroVault from "@/components/three/HeroVault.tsx";
import { Icon } from "@/components/ui.tsx";
import { Logo } from "@/components/Logo.tsx";
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

const facts = [
  { icon: "wallet" as const, title: "No single holder", body: "The money sits in a Sputnik DAO, the contract Trezu builds on. Not in a teammate's wallet." },
  { icon: "lock" as const, title: "The bot cannot pay itself", body: "Its DAO role is proposer only. Whoever got hold of the bot's key could draft payments, and the contract would refuse everything else." },
  { icon: "globe" as const, title: "Anyone can check", body: "The ledger reads the rules, votes and payments straight from the chain. So does npm run verify." },
];

// Today vs Commons, row by row.
const compare = [
  { q: "Where the money sits", before: "In one teammate's wallet", after: "In a Sputnik DAO the group owns" },
  { q: "Who can spend it", before: "Whoever holds that key, alone", after: "Only a majority of the council" },
  { q: "If the key or the bot is stolen", before: "The money goes with it", after: "The bot can only draft; the contract refuses the rest" },
  { q: "The record", before: "Screenshots and trust", after: "Every vote and payment on chain, in a public ledger" },
  { q: "Where it happens", before: "A wallet app, a bank, a spreadsheet", after: "The Telegram chat the group already uses" },
];

const stack = [
  { name: "Sputnik DAO v2", what: "holds the money and counts the votes" },
  { name: "Named accounts", what: "every member is <name>.<sponsor>" },
  { name: "Keys made on the phone", what: "the server only sees public keys" },
  { name: "NEAR Intents 1Click", what: "chip in from Base, Arbitrum, Solana, Ethereum, Tron" },
  { name: "Telegram Mini App", what: "vote where the group already talks" },
];

const HEADLINE = "Group money nobody has to hold.".split(" ");

export default async function Home() {
  const stats = await liveStats(demoDao);
  return (
    <main className="immersive min-h-dvh overflow-x-clip">
      <Spotlight />
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
        <div className="mx-auto grid max-w-6xl content-center items-center gap-2 px-4 pb-6 pt-28 sm:px-6 lg:min-h-[100svh] lg:grid-cols-[1.05fr_1fr] lg:pb-14 lg:pt-16">
          <div className="relative z-10">
            <p className="rise text-sm font-medium uppercase tracking-[0.18em] text-link" style={{ ["--i" as string]: 0 }}>
              Telegram group treasury on NEAR
            </p>
            <h1 className="font-display mt-5 text-[2.6rem] font-semibold leading-[1.02] sm:text-6xl lg:text-7xl">
              {HEADLINE.map((w, i) => (
                <span key={i} className="rise rise-word mr-[0.22em]" style={{ ["--i" as string]: i + 1 }}>
                  {w === "nobody" ? <span className="text-primary">{w}</span> : w}
                </span>
              ))}
            </h1>
            <p className="rise mt-6 max-w-xl text-lg leading-relaxed text-muted" style={{ ["--i" as string]: 7 }}>
              Prize money, event budgets, a team&apos;s shared fund. Today it sits in one person&apos;s wallet and everyone trusts them. Commons keeps it in a NEAR treasury the whole
              group owns, right inside your Telegram chat.
            </p>
            <div className="rise mt-8 flex flex-wrap gap-3" style={{ ["--i" as string]: 8 }}>
              {bot ? (
                <a
                  href={`https://t.me/${bot}?startgroup=commons`}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-on-primary shadow-[0_0_40px_-8px_rgb(245_158_11/0.7)] transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <Icon name="send" size={18} /> Add to a Telegram group
                </a>
              ) : null}
              {demoDao ? (
                <a href={`/c/${demoDao}`} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-6 font-medium transition-colors duration-200 hover:bg-white/5">
                  See a live ledger <Icon name="external" size={16} />
                </a>
              ) : null}
            </div>
            <ul className="rise mt-10 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" style={{ ["--i" as string]: 9 }} aria-label="What the scene shows">
              <li className="flex items-center gap-2">
                <span className="size-2.5 rotate-45 bg-primary" /> Member keys
              </li>
              <li className="flex items-center gap-2">
                <span className="size-2.5 bg-slate-400" /> The bot, proposer only
              </li>
              <li className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-ok" /> Approvals
              </li>
            </ul>
          </div>
          <div className="relative -mx-4 h-[380px] sm:h-[460px] lg:mx-0 lg:h-[640px]">
            <HeroVault />
          </div>
        </div>
      </section>

      {stats ? (
        <section className="border-y border-line bg-white/[0.02]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
            {[
              { k: "Payments made", v: String(stats.paid) },
              { k: "Approvals needed", v: `${stats.needed} of ${stats.council}` },
              { k: "Votes cast by the bot", v: String(stats.botVotes) },
              { k: "In the demo pot", v: stats.holds },
            ].map((s, i) => (
              <Reveal key={s.k} delay={i * 80}>
                <div className="text-xs uppercase tracking-wider text-muted">{s.k}</div>
                <div className="font-display mt-1 text-3xl font-semibold tabular-nums">
                  <CountUp value={s.v} />
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mx-auto max-w-6xl px-4 pb-6 text-xs text-muted sm:px-6">
            Read live from <span className="font-mono">{demoDao}</span> on NEAR testnet.{" "}
            {stats.botOk ? "The contract gives the bot the proposer role and nothing else." : null}
          </p>
        </section>
      ) : null}

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-link">How it works</p>
          <h2 className="font-display mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">From a chat message to a payment, with the group in charge</h2>
        </Reveal>
        <Reveal className="mt-12">
          <ChatDemo />
        </Reveal>
      </section>

      <section id="compare" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-link">Why it matters</p>
          <h2 className="font-display mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">Today, one person holds the group&apos;s money</h2>
          <p className="mt-4 max-w-2xl text-muted">
            Hackathon prizes are paid in one payment to one account. Event budgets and club funds work the same way. Everyone else trusts that person to pay them back.
          </p>
        </Reveal>
        <Reveal className="mt-10">
          <div className="overflow-hidden rounded-3xl border border-line">
            <div className="grid grid-cols-[1fr_1fr] text-xs font-medium uppercase tracking-wider sm:grid-cols-[0.8fr_1fr_1fr]">
              <div className="hidden px-5 py-4 text-muted sm:block" />
              <div className="px-5 py-4 text-muted">One wallet</div>
              <div className="flex items-center gap-2 bg-primary/[0.07] px-5 py-4 text-primary">
                <Logo size={18} /> Commons
              </div>
            </div>
            {compare.map((r) => (
              <div key={r.q} className="grid grid-cols-[1fr_1fr] border-t border-line text-sm sm:grid-cols-[0.8fr_1fr_1fr]">
                <div className="col-span-2 px-5 pt-4 text-xs font-medium uppercase tracking-wider text-muted sm:col-span-1 sm:py-4 sm:text-sm sm:normal-case sm:tracking-normal sm:text-fg">
                  {r.q}
                </div>
                <div className="flex gap-2 px-5 py-3 text-muted sm:py-4">
                  <Icon name="x" size={16} className="mt-0.5 shrink-0 text-bad" />
                  {r.before}
                </div>
                <div className="flex gap-2 bg-primary/[0.07] px-5 py-3 sm:py-4">
                  <Icon name="check" size={16} className="mt-0.5 shrink-0 text-ok" />
                  {r.after}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section id="safety" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-link">Safety</p>
          <h2 className="font-display mt-3 text-3xl font-semibold sm:text-4xl">Why the money is safe</h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {facts.map((f, i) => (
            <Reveal key={f.title} delay={i * 100} className="h-full">
              <div className="spotlight h-full rounded-3xl border border-line bg-card p-6 transition-colors duration-300 hover:border-primary/40">
                <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Icon name={f.icon} size={18} />
                </span>
                <h3 className="mt-5 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-12">
          <div className="rounded-3xl border border-line bg-card p-6 sm:p-8">
            <div className="flex items-center gap-2 text-sm font-medium text-bad">
              <Icon name="alert" size={16} /> We attacked our own bot on testnet
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              With the bot&apos;s key in hand we drafted &quot;send everything to the bot&quot;, then tried to approve it and to rewrite the rules. The contract refused both with{" "}
              <span className="font-mono text-fg">ERR_PERMISSION_DENIED</span>. The pot kept its money.
            </p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {REFUSED.map((r) => (
                <li key={r.hash}>
                  <a
                    href={`${explorer}/txns/${r.hash}`}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm transition-colors duration-200 hover:border-bad/60"
                  >
                    <span>
                      {r.what}
                      <span className="mt-0.5 block font-mono text-xs text-muted">{r.hash.slice(0, 10)}… failed</span>
                    </span>
                    <Icon name="external" size={16} className="shrink-0 text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6" aria-labelledby="stack">
        <Reveal>
          <h2 id="stack" className="text-xs font-medium uppercase tracking-[0.18em] text-link">
            Built on NEAR
          </h2>
        </Reveal>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stack.map((x, i) => (
            <li key={x.name}>
              <Reveal delay={i * 60} className="h-full">
                <div className="spotlight h-full rounded-2xl border border-line bg-card px-4 py-4">
                  <div className="font-display font-semibold">{x.name}</div>
                  <div className="mt-1 text-xs leading-relaxed text-muted">{x.what}</div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <section className="grain relative overflow-hidden border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <Reveal>
            <h2 className="font-display mx-auto max-w-2xl text-3xl font-semibold sm:text-5xl">Try it with your group</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              Add the bot to a Telegram group and send <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-fg">/commons</span>. It runs on NEAR testnet, so nothing real is at
              stake.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {bot ? (
                <a href={`https://t.me/${bot}?startgroup=commons`} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-on-primary">
                  <Icon name="send" size={18} /> Add @{bot}
                </a>
              ) : null}
              <a href={repo} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-6 font-medium transition-colors duration-200 hover:bg-white/5">
                Read the code <Icon name="external" size={16} />
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:px-6">
          <span>Built for the NEAR Hackathon 2026. Runs on NEAR testnet. MIT license.</span>
          <span className="font-mono">Sputnik DAO · named accounts · NEAR Intents</span>
        </div>
      </footer>
    </main>
  );
}
