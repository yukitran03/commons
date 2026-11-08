// In-memory Sputnik v2. It mirrors the contract's permission checks, vote thresholds and error strings closely enough
// that the bot logic, the offline demo and the attack checks behave the same way they do on testnet.
import { DAO_DEPOSIT, MEMBER_FUNDING, kindName, type Chain, type Proposal, type ProposalKind, type Signer, type Vote } from "./chain.ts";
import { canAct, councilOf, votesNeeded, type Policy } from "./policy.ts";

/** NEAR's account id rule (the real chain also enforces a 64-character limit). */
const ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

interface Dao {
  policy: Policy;
  proposals: Proposal[];
}

export class FakeChain implements Chain {
  network = "testnet" as const;
  factory: string;
  private balances = new Map<string, bigint>();
  private daos = new Map<string, Dao>();
  private tx = 0;
  private clock = 1_700_000_000_000_000_000n;

  constructor(factory = "sputnikv2.testnet") {
    this.factory = factory;
  }

  signer(accountId: string): Signer {
    return { accountId };
  }

  fund(accountId: string, yocto: bigint) {
    this.balances.set(accountId, (this.balances.get(accountId) ?? 0n) + yocto);
  }

  private hash() {
    return `fake-${++this.tx}`;
  }

  private spend(accountId: string, yocto: bigint) {
    const have = this.balances.get(accountId) ?? 0n;
    if (have < yocto) throw new Error("ERR_NOT_ENOUGH_BALANCE");
    this.balances.set(accountId, have - yocto);
  }

  private dao(daoId: string): Dao {
    const d = this.daos.get(daoId);
    if (!d) throw new Error(`ERR_NO_DAO ${daoId}`);
    return d;
  }

  async createDao(sponsor: Signer, name: string, _purpose: string, policy: Policy) {
    const daoId = `${name}.${this.factory}`;
    if (this.daos.has(daoId) || this.balances.has(daoId)) throw new Error("ERR_ACCOUNT_EXISTS");
    this.spend(sponsor.accountId, DAO_DEPOSIT);
    this.daos.set(daoId, { policy: structuredClone(policy), proposals: [] });
    this.balances.set(daoId, 0n); // the deposit pays for contract storage and is not spendable
    return { daoId, txHash: this.hash() };
  }

  async createMemberAccount(sponsor: Signer, name: string, _publicKey: string) {
    const accountId = `${name}.${sponsor.accountId}`;
    if (accountId.length > 64 || !ACCOUNT_ID.test(accountId)) throw new Error(`invalid account id ${accountId}`);
    if (this.balances.has(accountId)) throw new Error("ERR_ACCOUNT_EXISTS");
    this.spend(sponsor.accountId, MEMBER_FUNDING);
    this.balances.set(accountId, MEMBER_FUNDING);
    return { accountId, txHash: this.hash() };
  }

  async addProposal(signer: Signer, daoId: string, description: string, kind: ProposalKind) {
    const d = this.dao(daoId);
    if (!canAct(d.policy, signer.accountId, kindName(kind), "AddProposal")) throw new Error("ERR_PERMISSION_DENIED");
    this.spend(signer.accountId, BigInt(d.policy.proposal_bond));
    const id = d.proposals.length;
    d.proposals.push({
      id,
      proposer: signer.accountId,
      description,
      kind: structuredClone(kind),
      status: "InProgress",
      vote_counts: {},
      votes: {},
      submission_time: String((this.clock += 1_000_000_000n)),
    });
    return { id, txHash: this.hash() };
  }

  async act(signer: Signer, daoId: string, id: number, action: Vote, kind: ProposalKind) {
    const d = this.dao(daoId);
    const p = d.proposals[id];
    if (!p) throw new Error("ERR_NO_PROPOSAL");
    if (!canAct(d.policy, signer.accountId, kindName(p.kind), action)) throw new Error("ERR_PERMISSION_DENIED");
    if (JSON.stringify(p.kind) !== JSON.stringify(kind)) throw new Error("ERR_WRONG_KIND");
    if (p.status !== "InProgress") throw new Error("ERR_PROPOSAL_NOT_READY_FOR_VOTE");
    if (p.votes[signer.accountId]) throw new Error("ERR_ALREADY_VOTED");
    p.votes[signer.accountId] = action === "VoteApprove" ? "Approve" : "Reject";

    const council = councilOf(d.policy);
    const tally = (v: "Approve" | "Reject") => Object.entries(p.votes).filter(([who, x]) => x === v && council.includes(who)).length;
    const approve = tally("Approve");
    const reject = tally("Reject");
    p.vote_counts = { council: [String(approve), String(reject), "0"] };
    const needed = votesNeeded(d.policy);
    if (approve >= needed) this.execute(daoId, d, p);
    else if (reject >= needed) p.status = "Rejected";
    return { txHash: this.hash() };
  }

  private execute(daoId: string, d: Dao, p: Proposal) {
    const k = p.kind;
    if ("Transfer" in k) {
      const amount = BigInt(k.Transfer.amount);
      if (k.Transfer.token_id !== "" || (this.balances.get(daoId) ?? 0n) < amount) {
        p.status = "Failed";
        return;
      }
      this.spend(daoId, amount);
      this.fund(k.Transfer.receiver_id, amount);
    } else if ("AddMemberToRole" in k) {
      const role = d.policy.roles.find((r) => r.name === k.AddMemberToRole.role);
      if (role && typeof role.kind === "object" && "Group" in role.kind && !role.kind.Group.includes(k.AddMemberToRole.member_id)) {
        role.kind.Group.push(k.AddMemberToRole.member_id);
      }
    } else {
      d.policy = structuredClone(k.ChangePolicy.policy);
    }
    p.status = "Approved";
  }

  async transfer(signer: Signer, to: string, yocto: bigint) {
    this.spend(signer.accountId, yocto);
    this.fund(to, yocto);
    return { txHash: this.hash() };
  }

  async getPolicy(daoId: string) {
    return structuredClone(this.dao(daoId).policy);
  }

  async getProposal(daoId: string, id: number) {
    const p = this.dao(daoId).proposals[id];
    return p ? structuredClone(p) : null;
  }

  async getProposals(daoId: string) {
    return structuredClone(this.dao(daoId).proposals);
  }

  async balance(accountId: string) {
    return this.balances.get(accountId) ?? 0n;
  }

  async accountExists(accountId: string) {
    return this.balances.has(accountId) || this.daos.has(accountId);
  }
}
