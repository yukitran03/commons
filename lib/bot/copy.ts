// Every user-facing sentence lives here, so tone can be reviewed in one place. Plain words, no hype.
import { esc } from "../telegram.ts";
import type { MemberRow } from "../db.ts";

export const who = (m: Pick<MemberRow, "tg_username" | "display"> | null | undefined, fallback = "someone") =>
  m ? (m.tg_username ? `@${esc(m.tg_username)}` : esc(m.display)) : fallback;

export const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export const copy = {
  help: [
    "<b>Commons</b> keeps a group's money in a NEAR treasury that no single person holds.",
    "",
    "/commons · set up or show this group's treasury",
    "/spend 2 NEAR @name what it is for · ask the council to approve a payment",
    "/balance · what the pot holds",
    "/members · who is on the council",
    "/ledger · public record of every payment",
    "",
    "Each member's key stays on their own phone. I can draft payments, but I cannot vote or move money.",
  ].join("\n"),

  privateChat: "Add me to a group, then send /commons there. Each member gets their own NEAR account, and money only moves when a majority of the council approves.",

  addedToGroup: "Hi. I keep this group's money in a NEAR treasury that no single person holds. Send /commons to set it up.",

  setup: (title: string, joined: string[]) =>
    [
      `<b>Commons for ${esc(title)}</b>`,
      "A shared treasury on NEAR that no single person holds.",
      "",
      "1. Tap Join. You get your own NEAR account, and its key stays on your phone.",
      "2. Once two people have joined, a founder taps Create treasury.",
      "3. Money goes out only when a majority of the council approves.",
      "",
      joined.length ? `Joined so far: ${list(joined)}` : "Nobody has joined yet.",
    ].join("\n"),

  status: (o: { title: string; daoId: string; holds: string; council: number; needed: number; pending: number }) =>
    [
      `<b>Commons for ${esc(o.title)}</b>`,
      `Treasury: <code>${esc(o.daoId)}</code>`,
      `Holds: ${o.holds}`,
      `Council: ${o.council} members. Payments need ${o.needed} approvals.`,
      o.pending ? `Waiting to be voted in: ${o.pending}` : "",
      "I can draft payments, but I cannot vote or move money.",
    ]
      .filter(Boolean)
      .join("\n"),

  joinedFounder: (m: string, accountId: string, founders: number) =>
    `${m} joined as <code>${esc(accountId)}</code>. ${founders} ${founders === 1 ? "founder" : "founders"} so far.${founders >= 2 ? " A founder can now create the treasury." : ""}`,

  created: (daoId: string, council: string[], needed: number) =>
    [
      "<b>Treasury created</b>",
      `<code>${esc(daoId)}</code>`,
      `Council: ${list(council)}`,
      `Payments need ${needed} of ${council.length} approvals.`,
      "My role in this DAO is proposer only: I can draft payments, I cannot vote or move money. The ledger shows the rules as the contract stores them.",
    ].join("\n"),

  paymentCard: (o: { id: number; amount: string; to: string; accountId: string; reason: string; askedBy: string; approvals: string[]; needed: number; status: string }) => {
    const head = [`<b>Payment #${o.id}</b>`, `${o.amount} to ${o.to}`, `<code>${esc(o.accountId)}</code>`];
    if (o.reason) head.push(`For: ${esc(o.reason)}`);
    head.push(`Asked by ${o.askedBy}`);
    return [...head, "", progress(o)].join("\n");
  },

  memberCard: (o: { id: number; who: string; accountId: string; approvals: string[]; needed: number; status: string }) =>
    [`<b>New member #${o.id}</b>`, `Add ${o.who} to the council`, `<code>${esc(o.accountId)}</code>`, "", progress(o)].join("\n"),

  paid: (amount: string, to: string, reason: string, approvers: string[]) =>
    `<b>Paid</b> ${amount} to ${to}${reason ? ` for ${esc(reason)}` : ""}. Approved by ${list(approvers)}.`,
  rejected: (id: number) => `Payment #${id} was rejected by the council. No money moved.`,
  failed: (id: number) => `Payment #${id} was approved, but the transfer failed, most likely because the pot did not hold enough. No money moved.`,
  closed: (id: number, status: string) => `Proposal #${id} closed: ${statusWord(status)}.`,
  memberIn: (m: string, council: number, needed: number) => `${m} is now on the council. Payments need ${needed} of ${council} approvals.`,
  memberOut: (m: string) => `The council did not add ${m}.`,

  balance: (holds: string, daoId: string) => `The pot holds <b>${holds}</b>.\n<code>${esc(daoId)}</code>`,
  members: (rows: string[], needed: number) => `<b>Council</b>\n${rows.join("\n")}\n\nPayments need ${needed} approvals.`,
  ledger: "Every payment, vote and rule, read straight from the chain:",

  err: {
    noPot: "There is no treasury here yet. Send /commons to set one up.",
    noDao: "Create the treasury first: send /commons.",
    notJoined: "Only members who have joined can create the treasury. Tap Join first.",
    needTwo: "Two people need to join before the treasury can be created.",
    notCouncil: "Only council members can ask for a payment.",
    testnetNearOnly: "This pot is on testnet and holds NEAR only.",
    notMember: (h: string) => `${esc(h)} has not joined this pot yet. They can tap Join, or you can use a NEAR account name.`,
    noAccount: (id: string, network: string) => `<code>${esc(id)}</code> does not exist on NEAR ${network}.`,
    tooMuch: (holds: string, asked: string) => `The pot holds ${holds}, so it cannot pay ${asked}.`,
    badKey: "That public key is not a valid NEAR ed25519 key.",
    unknownPot: "This link does not belong to a Commons pot.",
    generic: "Something went wrong on my side. Try again in a minute.",
  },
};

function progress(o: { approvals: string[]; needed: number; status: string }): string {
  if (o.status !== "InProgress") return `Status: ${statusWord(o.status)}`;
  return `Approvals: ${o.approvals.length} of ${o.needed}${o.approvals.length ? ` (${list(o.approvals)})` : ""}`;
}

export function statusWord(s: string): string {
  return { Approved: "approved", Rejected: "rejected", Failed: "failed", Expired: "expired", Removed: "removed", Moved: "moved", InProgress: "open" }[s] ?? s.toLowerCase();
}

/** An error whose message is safe and useful to show to the person who caused it. */
export class UserError extends Error {}
