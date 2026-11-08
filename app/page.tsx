import { Card, Icon } from "@/components/ui.tsx";

const bot = process.env.TELEGRAM_BOT_USERNAME || "";
const demoDao = process.env.DEMO_DAO_ID || "";
const repo = "https://github.com/yukitran03/commons";

const steps = [
  { icon: "users" as const, title: "Everyone joins in the chat", body: "Tap Join and get your own NEAR account, like huc.commons.testnet. The key is created on your phone and stays there." },
  { icon: "send" as const, title: "Ask for money in one line", body: "/spend 25 NEAR @huc monitor for demo day. The bot turns it into a proposal on the group's Sputnik DAO." },
  { icon: "vote" as const, title: "A majority approves, the DAO pays", body: "Members sign their vote on their own phone. When enough approve, the contract pays out. Nobody can skip the vote." },
];

const facts = [
  { title: "No single holder", body: "The money sits in a Sputnik DAO, the same contract Trezu runs on. Not in a teammate's wallet." },
  { title: "The bot cannot pay itself", body: "Its DAO role is proposer only. Whoever got hold of the bot's key could draft payments, and the contract would refuse everything else." },
  { title: "Anyone can check", body: "The ledger reads the rules, votes and payments straight from the chain. So does npm run verify." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-on-primary">
            <Icon name="shield" size={18} />
          </span>
          Commons
        </div>
        <a href={repo} className="text-sm text-muted hover:text-fg">
          Source
        </a>
      </header>

      <section className="py-10 sm:py-16">
        <p className="text-sm font-medium text-link">Telegram group treasury on NEAR</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Group money nobody has to hold.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Prize money, event budgets, a team's shared fund. Today it sits in one person's wallet and everyone trusts them. Commons keeps it in a NEAR treasury owned by the whole group, right
          inside your Telegram chat.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {bot ? (
            <a href={`https://t.me/${bot}?startgroup=commons`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 font-medium text-on-primary transition-opacity duration-200 hover:opacity-90">
              <Icon name="send" size={18} /> Add to a Telegram group
            </a>
          ) : null}
          {demoDao ? (
            <a href={`/c/${demoDao}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-5 font-medium transition-colors duration-200 hover:bg-card">
              See a live ledger <Icon name="external" size={16} />
            </a>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="how" className="grid gap-4 sm:grid-cols-3">
        <h2 id="how" className="sr-only">
          How it works
        </h2>
        {steps.map((s, i) => (
          <Card key={s.title}>
            <div className="flex items-center gap-2 text-muted">
              <Icon name={s.icon} />
              <span className="text-sm font-medium">Step {i + 1}</span>
            </div>
            <h3 className="mt-3 font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </Card>
        ))}
      </section>

      <section aria-labelledby="safe" className="mt-14">
        <h2 id="safe" className="text-2xl font-semibold tracking-tight">
          Why the money is safe
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.title} className="border-l-2 border-primary pl-4">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-16 border-t border-line pt-6 text-sm text-muted">Built for the NEAR Hackathon 2026. Runs on NEAR testnet. Open source under the MIT license.</footer>
    </main>
  );
}
