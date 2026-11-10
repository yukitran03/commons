// Public ledger: everything here is read from the chain at request time, nothing from our database except the
// Telegram group's name (optional).
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge, Card, Icon, Mono, statusLabel, statusTone } from "@/components/ui.tsx";
import { accountUrl, nearConfig } from "@/lib/near/config.ts";
import { PROPOSER_ROLE, botIsProposerOnly, councilOf, votesNeeded, type Policy } from "@/lib/near/policy.ts";
import type { Proposal } from "@/lib/near/chain.ts";
import { fmtNear } from "@/lib/pot.ts";
import { viewKind } from "@/lib/proposalView.ts";
import { readChain } from "@/lib/server.ts";

export const dynamic = "force-dynamic";

const VALID = /^(([a-z\d]+[-_])*[a-z\d]+\.)+([a-z\d]+[-_])*[a-z\d]+$/;

export async function generateMetadata({ params }: { params: Promise<{ dao: string }> }): Promise<Metadata> {
  const { dao } = await params;
  return { title: `Ledger · ${dao}`, description: `Rules, votes and payments of ${dao}, read from NEAR.` };
}

/** Accounts checked as "the bot": whoever holds the proposer role, plus this deployment's configured bot account. */
function botsOf(policy: Policy): string[] {
  const r = policy.roles.find((x) => x.name === PROPOSER_ROLE);
  const inRole = r && typeof r.kind === "object" && "Group" in r.kind ? r.kind.Group : [];
  return [...new Set([...inRole, ...(process.env.BOT_ACCOUNT_ID ? [process.env.BOT_ACCOUNT_ID] : [])])];
}

function describe(p: Proposal): { title: string; detail: string | null; transfer: boolean } {
  const v = viewKind(p.kind as Record<string, unknown>);
  if (v.transfer && v.votable) return { title: `${v.headline} to`, detail: v.target, transfer: true };
  if (v.label === "New member") return { title: v.headline, detail: null, transfer: false };
  return { title: `${v.label}: ${v.headline}`, detail: v.target, transfer: v.transfer };
}

const when = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString().replace("T", " ").slice(0, 16) + " UTC";

export default async function Ledger({ params }: { params: Promise<{ dao: string }> }) {
  const { dao } = await params;
  if (!VALID.test(dao) || dao.length > 64) notFound();
  const cfg = nearConfig();
  const chain = readChain();
  if (!(await chain.accountExists(dao))) notFound();

  let policy: Policy;
  try {
    policy = await chain.getPolicy(dao);
  } catch {
    notFound();
  }
  const [proposals, holds] = await Promise.all([chain.getProposals(dao), chain.balance(dao)]);
  const council = councilOf(policy);
  const needed = votesNeeded(policy);
  const bots = botsOf(policy);
  const checks = bots.map((b) => ({ bot: b, ...botIsProposerOnly(policy, b) }));
  const paid = proposals.filter((p) => p.status === "Approved" && "Transfer" in p.kind).length;
  const readAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const checksOk = checks.length > 0 && checks.every((c) => c.ok);
  const stats = [
    { k: "Holds", v: fmtNear(holds), hint: "spendable" },
    { k: "Council", v: String(council.length), hint: "members" },
    { k: "Approvals needed", v: `${needed} of ${council.length}`, hint: "majority" },
    { k: "Payments made", v: String(paid), hint: "approved transfers" },
  ];

  return (
    <main className="immersive min-h-dvh">
      <div className="grain relative overflow-hidden border-b border-line">
        <div className="vault-glow pointer-events-none absolute -right-32 -top-32 size-[460px] opacity-80" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 pb-10 pt-5 sm:px-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <a href="/" className="flex min-h-11 items-center gap-2 font-semibold">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-on-primary">
                <Icon name="shield" size={18} />
              </span>
              Commons
            </a>
            <Badge>NEAR {cfg.network}</Badge>
          </header>

          <p className="mt-10 text-xs font-medium uppercase tracking-[0.18em] text-link">Public ledger · read from the chain</p>
          <h1 className="mt-3 break-all font-mono text-xl font-medium sm:text-3xl">{dao}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {checksOk ? (
              <Badge tone="ok">
                <Icon name="check" size={14} /> Bot cannot vote or move money
              </Badge>
            ) : null}
            <a href={accountUrl(cfg.explorer, dao)} className="inline-flex min-h-11 items-center gap-1 text-sm text-link hover:underline">
              Open in explorer <Icon name="external" size={14} />
            </a>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.k}>
                <dt className="text-xs uppercase tracking-wider text-muted">{s.k}</dt>
                <dd className="font-display mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{s.v}</dd>
                <dd className="text-xs text-muted">{s.hint}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="rounded-3xl">
            <h2 className="flex items-center gap-2 font-semibold">
              <Icon name="lock" /> Rules stored in the contract
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>
                Money moves only when{" "}
                <span className="text-fg">
                  {needed} of {council.length}
                </span>{" "}
                council members approve.
              </li>
              {bots.map((b) => (
                <li key={b}>
                  <Mono className="text-fg">{b}</Mono> holds role <Mono className="text-fg">{PROPOSER_ROLE}</Mono> with{" "}
                  {policy.roles
                    .find((r) => r.name === PROPOSER_ROLE)
                    ?.permissions.map((p) => (
                      <code key={p} className="mr-1 mt-1 inline-block whitespace-nowrap rounded bg-white/5 px-1.5 py-0.5 font-mono text-[0.8em] text-fg">
                        {p}
                      </code>
                    ))}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {checks.length === 0 ? <Badge>No bot role found</Badge> : null}
              {checks
                .filter((c) => !c.ok)
                .map((c) => (
                  <Badge key={c.bot} tone="bad">
                    <Icon name="alert" size={14} /> {c.problems[0]}
                  </Badge>
                ))}
            </div>
          </Card>

          <Card className="rounded-3xl">
            <h2 className="flex items-center gap-2 font-semibold">
              <Icon name="users" /> Council
            </h2>
            <ul className="mt-2">
              {council.map((m) => (
                <li key={m}>
                  <a href={accountUrl(cfg.explorer, m)} className="flex min-h-11 items-center gap-2 text-sm transition-colors duration-200 hover:text-link">
                    <span className="size-2 shrink-0 rotate-45 bg-primary" aria-hidden />
                    <Mono>{m}</Mono>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <section className="mt-10" aria-labelledby="history">
          <h2 id="history" className="font-display text-2xl font-semibold">
            Proposals
          </h2>
          {proposals.length === 0 ? <p className="mt-3 text-sm text-muted">No proposals yet.</p> : null}
          <ol className="mt-4 space-y-3">
            {[...proposals].reverse().map((p) => {
              const d = describe(p);
              const votes = Object.entries(p.votes);
              const approvals = votes.filter(([a, v]) => v === "Approve" && council.includes(a)).length;
              const bar = p.status === "Approved" ? 100 : Math.min(100, (approvals / Math.max(1, needed)) * 100);
              const failed = p.status === "Rejected" || p.status === "Failed";
              return (
                <li key={p.id}>
                  <Card className="rounded-3xl p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-muted">
                          #{p.id} · {when(p.submission_time)}
                        </div>
                        <div className="mt-1 font-medium">
                          {d.title} {d.detail ? <Mono>{d.detail}</Mono> : null}
                        </div>
                        <p className="mt-1 text-sm text-muted">{p.description}</p>
                      </div>
                      <Badge tone={statusTone(p.status)}>{statusLabel(p.status, d.transfer)}</Badge>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <div
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
                        role="progressbar"
                        aria-label="Council approvals"
                        aria-valuemin={0}
                        aria-valuemax={needed}
                        aria-valuenow={approvals}
                      >
                        <div className={`h-full rounded-full ${failed ? "bg-bad" : "bg-ok"}`} style={{ width: `${bar}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted">
                        {approvals} of {needed}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>
                        Proposed by <Mono>{p.proposer}</Mono>
                      </span>
                      {votes.length ? (
                        votes.map(([who, v]) => (
                          <span key={who} className="inline-flex items-center gap-1">
                            <Icon name={v === "Approve" ? "check" : "x"} size={12} className={v === "Approve" ? "text-ok" : "text-bad"} />
                            <Mono>{who}</Mono>
                          </span>
                        ))
                      ) : (
                        <span>No votes yet</span>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ol>
        </section>

        <footer className="mt-12 border-t border-line pt-5 text-xs text-muted">
          Read from NEAR {cfg.network} at {readAt} with get_policy, get_proposals and view_account. Our server stores no balances or votes.
        </footer>
      </div>
    </main>
  );
}
