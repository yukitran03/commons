import { beforeEach, describe, expect, it } from "vitest";
import { FakeChain } from "../lib/near/fakeChain.ts";
import { buildPolicy, councilOf, votesNeeded } from "../lib/near/policy.ts";
import { NEAR, type ProposalKind } from "../lib/near/chain.ts";

const BOND = (10n ** 22n).toString();
const near = (n: number) => BigInt(Math.round(n * 1000)) * 10n ** 21n;

let chain: FakeChain;
let daoId: string;
const sponsor = () => chain.signer("sponsor.testnet");
const bot = () => chain.signer("bot.testnet");
const pay = (to: string, n: number): ProposalKind => ({ Transfer: { token_id: "", receiver_id: to, amount: near(n).toString() } });

beforeEach(async () => {
  chain = new FakeChain();
  chain.fund("sponsor.testnet", near(100));
  chain.fund("bot.testnet", near(1));
  for (const m of ["a.testnet", "b.testnet", "c.testnet"]) chain.fund(m, near(5));
  const policy = buildPolicy({ council: ["a.testnet", "b.testnet", "c.testnet"], bot: "bot.testnet", bondYocto: BOND });
  daoId = (await chain.createDao(sponsor(), "team-abcdef", "test", policy)).daoId;
  await chain.transfer(chain.signer("a.testnet"), daoId, near(3));
});

describe("FakeChain follows Sputnik rules", () => {
  it("creates the DAO under the factory and charges the sponsor 6 NEAR", async () => {
    expect(daoId).toBe("team-abcdef.sputnikv2.testnet");
    expect(await chain.balance("sponsor.testnet")).toBe(near(94));
    expect(await chain.balance(daoId)).toBe(near(3));
  });

  it("creates member accounts under the sponsor with 0.5 NEAR, once", async () => {
    const r = await chain.createMemberAccount(sponsor(), "huc", "ed25519:FakePublicKey111");
    expect(r.accountId).toBe("huc.sponsor.testnet");
    expect(await chain.balance("huc.sponsor.testnet")).toBe(near(0.5));
    await expect(chain.createMemberAccount(sponsor(), "huc", "ed25519:FakePublicKey111")).rejects.toThrow("ERR_ACCOUNT_EXISTS");
  });

  it("lets the bot propose a transfer and charges the bond", async () => {
    const { id } = await chain.addProposal(bot(), daoId, "pizza", pay("b.testnet", 1));
    expect(id).toBe(0);
    expect((await chain.getProposal(daoId, 0))?.status).toBe("InProgress");
    expect(await chain.balance("bot.testnet")).toBe(near(1) - 10n ** 22n);
  });

  it("refuses a vote from the bot", async () => {
    const { id } = await chain.addProposal(bot(), daoId, "pizza", pay("b.testnet", 1));
    await expect(chain.act(bot(), daoId, id, "VoteApprove", pay("b.testnet", 1))).rejects.toThrow("ERR_PERMISSION_DENIED");
  });

  it("refuses a policy change proposed by the bot", async () => {
    const evil = buildPolicy({ council: ["bot.testnet"], bot: "bot.testnet", bondYocto: BOND });
    await expect(chain.addProposal(bot(), daoId, "evil", { ChangePolicy: { policy: evil } })).rejects.toThrow("ERR_PERMISSION_DENIED");
  });

  it("pays out only when a majority approves", async () => {
    const { id } = await chain.addProposal(bot(), daoId, "pizza", pay("b.testnet", 1));
    await chain.act(chain.signer("a.testnet"), daoId, id, "VoteApprove", pay("b.testnet", 1));
    expect((await chain.getProposal(daoId, id))?.status).toBe("InProgress");
    expect(await chain.balance("b.testnet")).toBe(near(5));
    await chain.act(chain.signer("b.testnet"), daoId, id, "VoteApprove", pay("b.testnet", 1));
    const p = await chain.getProposal(daoId, id);
    expect(p?.status).toBe("Approved");
    expect(p?.votes).toEqual({ "a.testnet": "Approve", "b.testnet": "Approve" });
    expect(await chain.balance("b.testnet")).toBe(near(6));
    expect(await chain.balance(daoId)).toBe(near(2));
  });

  it("rejects when a majority says no", async () => {
    const { id } = await chain.addProposal(bot(), daoId, "pizza", pay("b.testnet", 1));
    await chain.act(chain.signer("a.testnet"), daoId, id, "VoteReject", pay("b.testnet", 1));
    await chain.act(chain.signer("c.testnet"), daoId, id, "VoteReject", pay("b.testnet", 1));
    expect((await chain.getProposal(daoId, id))?.status).toBe("Rejected");
    expect(await chain.balance(daoId)).toBe(near(3));
  });

  it("refuses double votes, wrong kinds and votes on closed proposals", async () => {
    const { id } = await chain.addProposal(bot(), daoId, "pizza", pay("b.testnet", 1));
    await chain.act(chain.signer("a.testnet"), daoId, id, "VoteApprove", pay("b.testnet", 1));
    await expect(chain.act(chain.signer("a.testnet"), daoId, id, "VoteApprove", pay("b.testnet", 1))).rejects.toThrow("ERR_ALREADY_VOTED");
    await expect(chain.act(chain.signer("b.testnet"), daoId, id, "VoteApprove", pay("c.testnet", 1))).rejects.toThrow("ERR_WRONG_KIND");
    await chain.act(chain.signer("b.testnet"), daoId, id, "VoteApprove", pay("b.testnet", 1));
    await expect(chain.act(chain.signer("c.testnet"), daoId, id, "VoteApprove", pay("b.testnet", 1))).rejects.toThrow("ERR_PROPOSAL_NOT_READY_FOR_VOTE");
  });

  it("adds an approved member to the council, which raises the votes needed", async () => {
    const kind: ProposalKind = { AddMemberToRole: { member_id: "d.testnet", role: "council" } };
    const { id } = await chain.addProposal(bot(), daoId, "welcome d", kind);
    await chain.act(chain.signer("a.testnet"), daoId, id, "VoteApprove", kind);
    await chain.act(chain.signer("b.testnet"), daoId, id, "VoteApprove", kind);
    const policy = await chain.getPolicy(daoId);
    expect(councilOf(policy)).toContain("d.testnet");
    expect(votesNeeded(policy)).toBe(3);
  });

  it("marks a transfer larger than the treasury as Failed and keeps the money", async () => {
    const { id } = await chain.addProposal(bot(), daoId, "too much", pay("b.testnet", 50));
    await chain.act(chain.signer("a.testnet"), daoId, id, "VoteApprove", pay("b.testnet", 50));
    await chain.act(chain.signer("b.testnet"), daoId, id, "VoteApprove", pay("b.testnet", 50));
    expect((await chain.getProposal(daoId, id))?.status).toBe("Failed");
    expect(await chain.balance(daoId)).toBe(near(3));
  });

  it("returns null for an unknown proposal and lists the ones that exist", async () => {
    expect(await chain.getProposal(daoId, 99)).toBeNull();
    await chain.addProposal(bot(), daoId, "x", pay("b.testnet", 1));
    expect((await chain.getProposals(daoId)).map((p) => p.id)).toEqual([0]);
    expect(NEAR).toBe(10n ** 24n);
  });
});
