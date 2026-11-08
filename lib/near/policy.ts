// Sputnik DAO v2 policy: the JSON shape the contract stores, plus a faithful copy of its permission and vote rules.
// The bot's safety claim ("it can propose, never vote or pay") is checked against this model and against the live
// contract (scripts/verify.ts reads the real policy over RPC).

export type Action = "AddProposal" | "VoteApprove" | "VoteReject" | "VoteRemove" | "Finalize";
export type ProposalKindName = "transfer" | "add_member_to_role" | "change_policy" | (string & {});

/** Member(amount): any account with at least `amount` delegated tokens (Sputnik's token-weighted role). */
export type RoleKind = "Everyone" | { Group: string[] } | { Member: string };

export interface Role {
  name: string;
  kind: RoleKind;
  permissions: string[];
  vote_policy: Record<string, unknown>;
}

export interface VotePolicy {
  weight_kind: "RoleWeight" | "TokenWeight";
  quorum: string;
  threshold: [number, number] | string;
}

export interface Policy {
  roles: Role[];
  default_vote_policy: VotePolicy;
  proposal_bond: string;
  proposal_period: string;
  bounty_bond: string;
  bounty_forgiveness_period: string;
}

export const COUNCIL_ROLE = "council";
export const PROPOSER_ROLE = "proposer";
export const COUNCIL_PERMISSIONS = ["*:VoteApprove", "*:VoteReject", "*:VoteRemove", "*:Finalize", "*:AddProposal"];
export const PROPOSER_PERMISSIONS = ["transfer:AddProposal", "add_member_to_role:AddProposal"];

const WEEK_NS = "604800000000000";
const DAY_NS = "86400000000000";

export function buildPolicy(o: { council: string[]; bot: string; bondYocto: string }): Policy {
  return {
    roles: [
      { name: COUNCIL_ROLE, kind: { Group: [...o.council] }, permissions: [...COUNCIL_PERMISSIONS], vote_policy: {} },
      { name: PROPOSER_ROLE, kind: { Group: [o.bot] }, permissions: [...PROPOSER_PERMISSIONS], vote_policy: {} },
    ],
    default_vote_policy: { weight_kind: "RoleWeight", quorum: "0", threshold: [1, 2] },
    proposal_bond: o.bondYocto,
    proposal_period: WEEK_NS,
    bounty_bond: o.bondYocto,
    bounty_forgiveness_period: DAY_NS,
  };
}

function inRole(role: Role, accountId: string): boolean {
  if (role.kind === "Everyone") return true;
  if ("Group" in role.kind) return role.kind.Group.includes(accountId);
  // Sputnik's Member(amount) means "anyone whose delegated token balance is at least amount". Balances are not visible
  // here, so treat it as open to every account: the safe reading for any check that asks "could X do this?".
  if ("Member" in role.kind) return true;
  return false;
}

function permits(permission: string, kind: string, action: string): boolean {
  const [k, a] = permission.split(":");
  return (k === "*" || k === kind) && (a === "*" || a === action);
}

/** Same matching as Sputnik: any role the account is in that grants "<kind>:<action>", with "*" wildcards. */
export function canAct(policy: Policy, accountId: string, kind: ProposalKindName, action: Action): boolean {
  return policy.roles.some((r) => inRole(r, accountId) && r.permissions.some((p) => permits(p, kind, action)));
}

export function councilOf(policy: Policy): string[] {
  const r = policy.roles.find((x) => x.name === COUNCIL_ROLE);
  return r && typeof r.kind === "object" && "Group" in r.kind ? [...r.kind.Group] : [];
}

/** Sputnik's RoleWeight threshold for a ratio [n, d] over a group of size s: min(floor(s*n/d) + 1, s). */
export function votesNeeded(policy: Policy): number {
  const s = councilOf(policy).length;
  const t = policy.default_vote_policy.threshold;
  if (!Array.isArray(t)) return Math.min(Number(t), s);
  const [n, d] = t;
  return Math.min(Math.floor((s * n) / d) + 1, s);
}

/** The bot may only propose transfers and new members: no votes, no finalize, no policy changes, no open roles. */
export function botIsProposerOnly(policy: Policy, bot: string): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const role of policy.roles) {
    if (role.kind === "Everyone") problems.push(`role "${role.name}" is open to Everyone`);
    else if ("Member" in role.kind) problems.push(`role "${role.name}" is a Member role, open to any account holding ${role.kind.Member} delegated tokens`);
    if (!inRole(role, bot)) continue;
    for (const p of role.permissions) {
      const [kind, action] = p.split(":");
      const allowedProposal = action === "AddProposal" && (kind === "transfer" || kind === "add_member_to_role");
      if (!allowedProposal) problems.push(`bot holds "${p}" through role "${role.name}"`);
    }
  }
  return { ok: problems.length === 0, problems };
}
