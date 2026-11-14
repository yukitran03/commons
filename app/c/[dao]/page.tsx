// Public ledger: everything here is read from the chain at request time, nothing from our database except the
// Telegram group's name (optional). It is laid out as an account book: a summary with the balance double-underlined,
// the rules as a charter, and one ruled line per proposal with its signatures and a status stamp.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArcMeter } from "@/components/ArcMeter.tsx";
import { Icon, Mono, statusLabel } from "@/components/ui.tsx";
import { Logo } from "@/components/Logo.tsx";
import { accountUrl, nearConfig } from "@/lib/near/config.ts";
import { PROPOSER_ROLE, botIsProposerOnly, councilOf, effectiveStatus, votesNeeded, type Policy } from "@/lib/near/policy.ts";
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

/** Accounts that hold the proposer role in this DAO. */
function proposersOf(policy: Policy): string[] {
  const r = policy.roles.find((x) => x.name === PROPOSER_ROLE);
  return r && typeof r.kind === "object" && "Group" in r.kind ? [...r.kind.Group] : [];
}

/** Accounts checked as "the bot": whoever holds the proposer role, plus this deployment's configured bot account. */
function botsOf(policy: Policy): string[] {
  return [...new Set([...proposersOf(policy), ...(process.env.BOT_ACCOUNT_ID ? [process.env.BOT_ACCOUNT_ID] : [])])];
}

function describe(p: Proposal): { title: string; detail: string | null; transfer: boolean } {
  const v = viewKind(p.kind as Record<string, unknown>);
  if (v.transfer && v.votable) return { title: `${v.headline} to`, detail: v.target, transfer: true };
  if (v.label === "New member") return { title: v.headline, detail: null, transfer: false };
  return { title: `${v.label}: ${v.headline}`, detail: v.target, transfer: v.transfer };
}

const when = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString().replace("T", " ").slice(0, 16);

/** Stamp ink for a proposal status: green when it went through, red when it did not, amber while voting. */
function stampInk(status: string): string {
  if (status === "Approved") return "text-ok";
  if (status === "InProgress") return "text-pend";
  if (status === "Rejected" || status === "Failed" || status === "Removed" || status === "Expired") return "text-bad";
  return "text-muted";
}

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
  const botPerms = policy.roles.find((r) => r.name === PROPOSER_ROLE)?.permissions ?? [];
  // The charter lists only accounts the DAO really gives the proposer role.
  const proposers = proposersOf(policy);

  return (
    <main className="immersive min-h-dvh pb-16">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <a href="/" className="flex min-h-11 items-center gap-2 font-semibold">
          <Logo size={32} />
          Commons
        </a>
        <span className="rounded-full border border-line px-3 py-1 font-mono text-xs text-muted">NEAR {cfg.network}</span>
      </header>

      <div className="paper sheet tear-bottom mx-1.5 sm:mx-3 lg:mx-auto lg:max-w-6xl">
        <div className="mx-auto max-w-5xl px-5 pb-14 pt-10 sm:px-8 sm:pt-14">
          <p className="section-mark">
            <b>Public ledger</b> read from the chain
          </p>

          <div className="mt-8 flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-5xl font-medium leading-none sm:text-6xl">Ledger</h1>
              <p className="mt-3 break-all font-mono text-sm text-muted sm:text-base">{dao}</p>
              <div className="mt-4 flex flex-wrap gap-x-5">
                <a href={accountUrl(cfg.explorer, dao)} className="inline-flex min-h-11 items-center gap-1 text-sm text-link underline decoration-1 underline-offset-4 hover:decoration-2">
                  Open in explorer <Icon name="external" size={14} />
                </a>
                <a href={`/c/${dao}/csv`} download className="inline-flex min-h-11 items-center gap-1 text-sm text-link underline decoration-1 underline-offset-4 hover:decoration-2">
                  Download CSV <Icon name="download" size={14} />
                </a>
              </div>
            </div>
            {checksOk ? (
              <span className="stamp mt-2 text-sm text-ok sm:text-base" style={{ ["--r" as string]: "-5deg" }}>
                <Icon name="check" size={16} /> Bot cannot vote or move money
              </span>
            ) : null}
          </div>

          {/* Summary, as at the top of an account book. */}
          <dl className="mt-10 grid grid-cols-2 border-y-2 border-[var(--rule-strong)] sm:grid-cols-4">
            {[
              { k: "Holds", v: fmtNear(holds), hint: "spendable", total: true },
              { k: "Council", v: String(council.length), hint: "members" },
              { k: "Approvals needed", v: `${needed} of ${council.length}`, hint: "majority" },
              { k: "Payments made", v: String(paid), hint: "approved transfers" },
            ].map((s, i) => (
              <div key={s.k} className={`px-4 py-5 sm:px-5 ${i % 2 ? "border-l border-[var(--rule)]" : ""} ${i > 1 ? "border-t border-[var(--rule)] sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
                <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{s.k}</dt>
                <dd className={`font-display mt-2 text-2xl font-medium tabular-nums sm:text-3xl ${s.total ? "double-under" : ""}`}>{s.v}</dd>
                <dd className="mt-1 text-xs text-muted">{s.hint}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-10 grid gap-6 md:grid-cols-[1.2fr_1fr]">
            <section className="charter bg-[rgb(255_253_248/0.6)] p-6 sm:p-7" aria-labelledby="rules">
              <h2 id="rules" className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                <Icon name="lock" size={14} /> Rules stored in the contract
              </h2>
              <ol className="mt-4 space-y-4">
                <li className="flex gap-4">
                  <span className="foil font-display text-3xl font-semibold leading-none">I</span>
                  <p className="leading-relaxed">
                    Money moves only when{" "}
                    <b className="font-semibold">
                      {needed} of {council.length}
                    </b>{" "}
                    council members approve.
                  </p>
                </li>
                {proposers.map((b) => (
                  <li key={b} className="flex gap-4">
                    <span className="foil font-display text-3xl font-semibold leading-none">II</span>
                    <p className="min-w-0 leading-relaxed">
                      <Mono>{b}</Mono> holds role <Mono>{PROPOSER_ROLE}</Mono> with{" "}
                      {botPerms.map((p) => (
                        <code key={p} className="mr-1 mt-1 inline-block whitespace-nowrap rounded-sm border border-[var(--rule)] bg-[var(--slip)] px-1.5 py-0.5 font-mono text-[0.78em]">
                          {p}
                        </code>
                      ))}
                    </p>
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex flex-wrap gap-2">
                {checks.length === 0 ? <span className="stamp text-xs text-muted">No bot role found</span> : null}
                {checks
                  .filter((c) => !c.ok)
                  .map((c) => (
                    <span key={c.bot} className="stamp text-xs text-bad" style={{ ["--r" as string]: "0deg" }}>
                      <Icon name="alert" size={14} /> {c.problems[0]}
                    </span>
                  ))}
              </div>
            </section>

            <section className="border-t-2 border-[var(--rule-strong)] pt-5 md:border-t-0 md:pt-0" aria-labelledby="council">
              <h2 id="council" className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                <Icon name="users" size={14} /> Council · {council.length} keys
              </h2>
              <ul className="mt-3">
                {council.map((m, i) => (
                  <li key={m} className="border-b border-[var(--rule)]">
                    <a href={accountUrl(cfg.explorer, m)} className="flex min-h-12 items-center gap-3 text-sm transition-colors duration-200 hover:text-link">
                      <span className="w-6 shrink-0 font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <Mono>{m}</Mono>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="mt-14" aria-labelledby="history">
            <div className="flex items-end justify-between gap-4">
              <h2 id="history" className="font-display text-3xl font-medium sm:text-4xl">
                Proposals
              </h2>
              <span className="font-mono text-xs text-muted">{proposals.length} entries</span>
            </div>
            {proposals.length === 0 ? <p className="mt-3 text-sm text-muted">No proposals yet.</p> : null}
            {proposals.length ? (
              <div className="ledger-lines mt-5 border-y-2 border-[var(--rule-strong)] bg-[rgb(255_253_248/0.55)]">
                <div className="hidden grid-cols-[7.5rem_1fr_9rem_8.5rem] gap-4 border-b border-[var(--rule-strong)] py-2.5 pl-12 pr-4 font-mono text-[11px] uppercase tracking-[0.16em] text-muted md:grid">
                  <span>Date, UTC</span>
                  <span>Entry</span>
                  <span>Signatures</span>
                  <span className="text-right">Status</span>
                </div>
                <ol>
                  {[...proposals].reverse().map((p) => {
                    const d = describe(p);
                    const votes = Object.entries(p.votes);
                    const approvals = votes.filter(([a, v]) => v === "Approve" && council.includes(a)).length;
                    const rejections = votes.filter(([a, v]) => v === "Reject" && council.includes(a)).length;
                    return (
                      <li key={p.id} className="relative grid gap-x-4 gap-y-3 border-b border-[var(--rule)] py-5 pl-12 pr-4 last:border-b-0 md:grid-cols-[7.5rem_1fr_9rem_8.5rem] md:items-center">
                        <span className="absolute left-0 top-5 w-[30px] text-center font-mono text-xs text-muted md:top-1/2 md:-translate-y-1/2">#{p.id}</span>
                        <span className="font-mono text-xs text-muted">{when(p.submission_time)}</span>
                        <div className="min-w-0">
                          <div className="font-display text-lg leading-snug">
                            {d.title} {d.detail ? <Mono>{d.detail}</Mono> : null}
                          </div>
                          <p className="mt-1 text-sm text-muted">{p.description}</p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                            <span>
                              Proposed by <Mono>{p.proposer}</Mono>
                            </span>
                            {votes.map(([who, v]) => (
                              <span key={who} className="inline-flex items-center gap-1">
                                <Icon name={v === "Approve" ? "check" : "x"} size={12} className={v === "Approve" ? "text-ok" : "text-bad"} />
                                <Mono>{who}</Mono>
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <ArcMeter seats={council.length} approvals={approvals} rejections={rejections} needed={needed} size={44} className="text-fg" />
                          <span className="text-xs tabular-nums text-muted">
                            {approvals} of {needed}
                          </span>
                        </div>
                        <div className="md:text-right">
                          <span className={`stamp text-xs ${stampInk(effectiveStatus(p, policy.proposal_period))}`} style={{ ["--r" as string]: p.id % 2 ? "-4deg" : "3deg" }}>
                            {statusLabel(effectiveStatus(p, policy.proposal_period), d.transfer)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}
          </section>

          <p className="mt-10 border-t border-[var(--rule)] pt-4 text-xs leading-relaxed text-muted">
            <span className="text-link">*</span> Read from NEAR {cfg.network} at {readAt} with get_policy, get_proposals and view_account. Our server stores no balances or votes.
          </p>
        </div>
      </div>
    </main>
  );
}
