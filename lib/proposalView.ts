// How a proposal is shown to someone about to vote on it. Built from the chain's own proposal kind, never from the
// free-text description, so a council member cannot dress a policy change up as "add Carol".
import { TOKENS, fromUnits } from "./tokens.ts";

export interface KindView {
  /** The proposal's real kind ("Payment", "New member", or Sputnik's own name such as "ChangePolicy"). */
  label: string;
  headline: string;
  target: string | null;
  transfer: boolean;
  /** Commons only offers a vote on kinds it files itself and can show faithfully. */
  votable: boolean;
  warning: string | null;
}

const FOREIGN = "Commons never files this kind of proposal. Anyone on the council can, so read it in a Sputnik UI before voting.";

export function viewKind(kind: Record<string, any>): KindView {
  const name = Object.keys(kind)[0] ?? "Unknown";
  const t = kind.Transfer;
  if (t) {
    if (t.token_id === "") return { label: "Payment", headline: `${fromUnits(t.amount, TOKENS.NEAR.decimals, 6)} NEAR`, target: t.receiver_id, transfer: true, votable: true, warning: null };
    if (t.token_id === TOKENS.USDC.tokenId.mainnet) return { label: "Payment", headline: `${fromUnits(t.amount, TOKENS.USDC.decimals, 6)} USDC`, target: t.receiver_id, transfer: true, votable: true, warning: null };
    return {
      label: "Token transfer",
      headline: `${t.amount} base units of ${t.token_id}`,
      target: t.receiver_id,
      transfer: true,
      votable: false,
      warning: "Commons only moves NEAR and USDC. Check this token in a Sputnik UI before voting.",
    };
  }
  const m = kind.AddMemberToRole;
  if (m) {
    const council = m.role === "council";
    return { label: "New member", headline: `Add ${m.member_id} to the ${m.role}`, target: m.member_id, transfer: false, votable: council, warning: council ? null : FOREIGN };
  }
  return { label: name, headline: "Not created by Commons", target: null, transfer: false, votable: false, warning: FOREIGN };
}
