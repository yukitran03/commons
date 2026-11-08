// Public ledger: everything here is read from the chain at request time, nothing from our database except the
// Telegram group's name (optional).
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge, Card, Icon, Mono, Stat, statusLabel, statusTone } from "@/components/ui.tsx";
import { accountUrl, nearConfig } from "@/lib/near/config.ts";
import { PROPOSER_ROLE, botIsProposerOnly, councilOf, votesNeeded, type Policy } from "@/lib/near/policy.ts";
import type { Proposal } from "@/lib/near/chain.ts";
import { fmtNear, tokenOf } from "@/lib/pot.ts";
import { fromUnits } from "@/lib/tokens.ts";
import { readChain } from "@/lib/server.ts";

export const dynamic = "force-dynamic";

const VALID = /^(([a-z\d]+[-_])*[a-z\d]+\.)+([a-z\d]+[-_])*[a-z\d]+$/;

export async function generateMetadata({ params }: { params: Promise<{ dao: string }> }): Promise<Metadata> {
  const { dao } = await params;
  return { title: `Ledger · ${dao}`, description: `Rules, votes and payments of ${dao}, read from NEAR.` };
}

function proposerOf(policy: Policy): string[] {
  const r = policy.roles.find((x) => x.name === PROPOSER_ROLE);
  return r && typeof r.kind === "object" && "Group" in r.kind ? r.kind.Group : [];
}

function describe(p: Proposal): { title: string; detail: string | null; transfer: boolean } {
  if ("Transfer" in p.kind) {
    const t = tokenOf(p.kind.Transfer.token_id);
    return { title: `${fromUnits(p.kind.Transfer.amount, t.decimals, 6)} ${t.symbol} to`, detail: p.kind.Transfer.receiver_id, transfer: true };
  }
  if ("AddMemberToRole" in p.kind) return { title: `Add to ${p.kind.AddMemberToRole.role}:`, detail: p.kind.AddMemberToRole.member_id, transfer: false };
  return { title: "Change policy", detail: null, transfer: false };
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
  const bots = proposerOf(policy);
  const checks = bots.map((b) => ({ bot: b, ...botIsProposerOnly(policy, b) }));
  const paid = proposals.filter((p) => p.status === "Approved" && "Transfer" in p.kind).length;
  const readAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <a href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-on-primary">
            <Icon name="shield" size={18} />
          </span>
          Commons ledger
        </a>
        <Badge>NEAR {cfg.network}</Badge>
      </header>

      <section className="py-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          <Mono className="text-[0.9em]">{dao}</Mono>
        </h1>
        <a href={accountUrl(cfg.explorer, dao)} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm text-link hover:underline">
          Open in explorer <Icon name="external" size={14} />
        </a>
      </section>

      <Card>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="Holds" value={fmtNear(holds)} hint="spendable" />
          <Stat label="Council" value={council.length} hint="members" />
          <Stat label="Approvals needed" value={`${needed} of ${council.length}`} />
          <Stat label="Payments made" value={paid} />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="flex items-center gap-2 font-semibold">
            <Icon name="lock" /> Rules stored in the contract
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>Money moves only when {needed} of {council.length} council members approve.</li>
            {bots.map((b) => (
              <li key={b}>
                <Mono>{b}</Mono> holds role <Mono>{PROPOSER_ROLE}</Mono> with{" "}
                {policy.roles
                  .find((r) => r.name === PROPOSER_ROLE)
                  ?.permissions.map((p) => (
                    <code key={p} className="mr-1 mt-1 inline-block whitespace-nowrap rounded bg-bg px-1 font-mono text-[0.8em]">
                      {p}
                    </code>
                  ))}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {checks.length === 0 ? <Badge>No bot role found</Badge> : null}
            {checks.map((c) =>
              c.ok ? (
                <Badge key={c.bot} tone="ok">
                  <Icon name="check" size={14} /> Bot cannot vote or move money
                </Badge>
              ) : (
                <Badge key={c.bot} tone="bad">
                  <Icon name="alert" size={14} /> {c.problems[0]}
                </Badge>
              ),
            )}
          </div>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 font-semibold">
            <Icon name="users" /> Council
          </h2>
          <ul className="mt-3 space-y-1">
            {council.map((m) => (
              <li key={m}>
                <a href={accountUrl(cfg.explorer, m)} className="inline-flex min-h-11 items-center gap-1 text-sm hover:text-link">
                  <Mono>{m}</Mono>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section className="mt-8" aria-labelledby="history">
        <h2 id="history" className="text-lg font-semibold">
          Proposals
        </h2>
        {proposals.length === 0 ? <p className="mt-3 text-sm text-muted">No proposals yet.</p> : null}
        <ol className="mt-3 space-y-3">
          {[...proposals].reverse().map((p) => {
            const d = describe(p);
            const votes = Object.entries(p.votes);
            return (
              <li key={p.id}>
                <Card className="p-4">
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

      <footer className="mt-10 border-t border-line pt-5 text-xs text-muted">
        Read from NEAR {cfg.network} at {readAt} with get_policy, get_proposals and view_account. Our server stores no balances or votes.
      </footer>
    </main>
  );
}
