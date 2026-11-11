// The public ledger as a CSV file, for a treasurer's spreadsheet or an accountant. Built from the chain's proposals
// only. Free text (the proposer's note) is defused so a spreadsheet never runs it as a formula.
import type { Proposal } from "./near/chain.ts";
import { viewKind } from "./proposalView.ts";

const HEADER = ["id", "submitted_utc", "kind", "amount", "token", "to", "status", "approvals", "rejections", "approved_by", "proposer", "description"];

/** One CSV cell (RFC 4180), with a leading ' on anything a spreadsheet would read as a formula. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const utc = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString().replace("T", " ").slice(0, 16);

export function ledgerCsv(proposals: Proposal[]): string {
  const rows = [...proposals]
    .sort((a, b) => a.id - b.id)
    .map((p) => {
      const v = viewKind(p.kind as Record<string, unknown>);
      const [amount, token] = v.transfer && v.votable ? v.headline.split(" ") : v.transfer ? [(p.kind as { Transfer: { amount: string } }).Transfer.amount, (p.kind as { Transfer: { token_id: string } }).Transfer.token_id] : ["", ""];
      const votes = Object.entries(p.votes);
      const approvedBy = votes.filter(([, x]) => x === "Approve").map(([a]) => a);
      return [p.id, utc(p.submission_time), v.label, amount, token, v.target ?? "", p.status, approvedBy.length, votes.filter(([, x]) => x === "Reject").length, approvedBy.join(" "), p.proposer, p.description];
    });
  return [HEADER, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
