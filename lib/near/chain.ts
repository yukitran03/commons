// What the app needs from NEAR. RpcChain talks to a real network; FakeChain is an in-memory model of the same
// Sputnik rules for tests and the offline demo.
import type { Policy } from "./policy.ts";

export const NEAR = 10n ** 24n;

export type ProposalKind =
  | { Transfer: { token_id: string; receiver_id: string; amount: string } }
  | { AddMemberToRole: { member_id: string; role: string } }
  | { ChangePolicy: { policy: Policy } };

export type ProposalStatus = "InProgress" | "Approved" | "Rejected" | "Removed" | "Expired" | "Moved" | "Failed";

export interface Proposal {
  id: number;
  proposer: string;
  description: string;
  kind: ProposalKind;
  status: ProposalStatus;
  vote_counts: Record<string, [string, string, string]>;
  votes: Record<string, "Approve" | "Reject" | "Remove">;
  submission_time: string;
}

export interface Signer {
  accountId: string;
}

export type Vote = "VoteApprove" | "VoteReject";

export interface Chain {
  network: "testnet" | "mainnet";
  createDao(sponsor: Signer, name: string, purpose: string, policy: Policy): Promise<{ daoId: string; txHash: string }>;
  createMemberAccount(sponsor: Signer, name: string, publicKey: string): Promise<{ accountId: string; txHash: string }>;
  addProposal(signer: Signer, daoId: string, description: string, kind: ProposalKind): Promise<{ id: number; txHash: string }>;
  act(signer: Signer, daoId: string, id: number, action: Vote, kind: ProposalKind): Promise<{ txHash: string }>;
  transfer(signer: Signer, to: string, yocto: bigint): Promise<{ txHash: string }>;
  getPolicy(daoId: string): Promise<Policy>;
  getProposal(daoId: string, id: number): Promise<Proposal | null>;
  getProposals(daoId: string): Promise<Proposal[]>;
  /** Spendable balance in yoctoNEAR (total minus what storage locks). */
  balance(accountId: string): Promise<bigint>;
  accountExists(accountId: string): Promise<boolean>;
}

export function kindName(kind: ProposalKind): "transfer" | "add_member_to_role" | "change_policy" {
  if ("Transfer" in kind) return "transfer";
  if ("AddMemberToRole" in kind) return "add_member_to_role";
  return "change_policy";
}

export const DAO_DEPOSIT = 6n * NEAR;
/** 0.5 NEAR for each new member. NEAR reserves prepaid gas at a pessimistic price (about 0.1 NEAR for a 100 Tgas vote), so members need headroom beyond what they chip in. */
export const MEMBER_FUNDING = 5n * 10n ** 23n;
