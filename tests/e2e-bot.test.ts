import { beforeEach, describe, expect, it } from "vitest";
import { handleUpdate } from "../lib/bot/handlers.ts";
import { createTreasury, joinPot, refreshProposal } from "../lib/pot.ts";
import { memberByTg, potByChat } from "../lib/db.ts";
import { botIsProposerOnly, councilOf, votesNeeded } from "../lib/near/policy.ts";
import { NEAR, type ProposalKind } from "../lib/near/chain.ts";
import { CHAT, people, world } from "./helpers/world.ts";

type W = Awaited<ReturnType<typeof world>>;
let w: W;
let ref: string;

const urls = (call: any): string[] => (call?.body?.reply_markup?.inline_keyboard ?? []).flat().map((b: any) => b.url).filter(Boolean);
const callbacks = (call: any): string[] => (call?.body?.reply_markup?.inline_keyboard ?? []).flat().map((b: any) => b.callback_data).filter(Boolean);

async function setup() {
  await handleUpdate(w.deps, w.msg(people.alice, "/commons"));
  ref = (await potByChat(w.db, CHAT))!.ref;
}
async function joinFounders() {
  await joinPot(w.deps, { ref, tgUser: people.alice, publicKey: w.publicKey() });
  await joinPot(w.deps, { ref, tgUser: people.bob, publicKey: w.publicKey() });
}
async function treasury() {
  await setup();
  await joinFounders();
  await handleUpdate(w.deps, w.tap(people.alice, "create"));
  const daoId = (await potByChat(w.db, CHAT))!.dao_id!;
  await w.chain.transfer(w.chain.signer("alice.sponsor.testnet"), daoId, 2n * 10n ** 23n); // alice chips in 0.2 NEAR
  return daoId;
}

beforeEach(async () => {
  w = await world();
});

describe("setting up a pot", () => {
  it("/commons posts a Join link that opens the Mini App", async () => {
    await setup();
    const last = w.tg.sent().at(-1);
    expect(urls(last)).toContain(`https://t.me/commons_near_bot/app?startapp=j_${ref}`);
  });

  it("two joins create two founder accounts under the sponsor", async () => {
    await setup();
    await joinFounders();
    expect((await memberByTg(w.db, CHAT, people.alice.id))).toMatchObject({ account_id: "alice.sponsor.testnet", role: "founder" });
    expect((await memberByTg(w.db, CHAT, people.bob.id))).toMatchObject({ account_id: "bob.sponsor.testnet", role: "founder" });
    expect(await w.chain.balance("bob.sponsor.testnet")).toBe(5n * 10n ** 23n);
    expect(callbacks(w.tg.sent().at(-1))).toContain("create");
  });

  it("a founder creates the DAO with the founders as council and the bot as proposer only", async () => {
    const daoId = await treasury();
    expect(daoId).toMatch(/^hack-team-[a-z2-7]{6}\.sputnikv2\.testnet$/);
    const policy = await w.chain.getPolicy(daoId);
    expect(councilOf(policy)).toEqual(["alice.sponsor.testnet", "bob.sponsor.testnet"]);
    expect(botIsProposerOnly(policy, "bot.testnet").ok).toBe(true);
    expect((await memberByTg(w.db, CHAT, people.alice.id))?.role).toBe("council");
    expect(w.tg.texts().some((t) => t.includes(daoId))).toBe(true);
    expect(w.tg.sent().flatMap(urls)).toContain(`https://commons.test/c/${daoId}`);
  });

  it("someone who has not joined cannot create the treasury", async () => {
    await setup();
    await joinFounders();
    await handleUpdate(w.deps, w.tap(people.eve, "create"));
    expect((await potByChat(w.db, CHAT))?.dao_id).toBeNull();
    const answer = w.tg.calls.filter((c) => c.method === "answerCallbackQuery").at(-1);
    expect(answer?.body.text).toMatch(/joined/i);
  });

  it("one founder alone cannot create the treasury", async () => {
    await setup();
    await joinPot(w.deps, { ref, tgUser: people.alice, publicKey: w.publicKey() });
    await expect(createTreasury(w.deps, CHAT, people.alice.id)).rejects.toThrow(/two/i);
  });

  it("join and create are idempotent", async () => {
    await setup();
    const first = await joinPot(w.deps, { ref, tgUser: people.alice, publicKey: w.publicKey() });
    const again = await joinPot(w.deps, { ref, tgUser: people.alice, publicKey: w.publicKey() });
    expect(again.accountId).toBe(first.accountId);
    expect(await w.chain.balance("sponsor.testnet")).toBe(100n * NEAR - 5n * 10n ** 23n);
    await joinPot(w.deps, { ref, tgUser: people.bob, publicKey: w.publicKey() });
    const a = await createTreasury(w.deps, CHAT, people.alice.id);
    const b = await createTreasury(w.deps, CHAT, people.bob.id);
    expect(a.created).toBe(true);
    expect(b).toMatchObject({ daoId: a.daoId, created: false });
    expect(await w.chain.balance("sponsor.testnet")).toBe(100n * NEAR - 10n * 10n ** 23n - 6n * NEAR);
  });

  it("refuses a malformed public key", async () => {
    await setup();
    await expect(joinPot(w.deps, { ref, tgUser: people.alice, publicKey: "ed25519:short" })).rejects.toThrow(/key/i);
  });

  it("gives a member without a username a valid name", async () => {
    await setup();
    const r = await joinPot(w.deps, { ref, tgUser: { id: 98761234, first_name: "Huấn" }, publicKey: w.publicKey() });
    expect(r.accountId).toBe("huan-1234.sponsor.testnet");
  });
});

describe("spending", () => {
  it("/spend files a transfer proposal and posts a vote card", async () => {
    const daoId = await treasury();
    await handleUpdate(w.deps, w.msg(people.alice, "/spend 0.1 NEAR @bob pizza night"));
    const p = await w.chain.getProposal(daoId, 0);
    expect(p).toMatchObject({ proposer: "bot.testnet", status: "InProgress" });
    expect(p?.kind).toEqual({ Transfer: { token_id: "", receiver_id: "bob.sponsor.testnet", amount: (10n ** 23n).toString() } });
    expect(p?.description).toContain("pizza night");
    const card = w.tg.sent().at(-1);
    expect(urls(card)).toContain(`https://t.me/commons_near_bot/app?startapp=v_${ref}_0`);
    expect(card?.body.text).toContain("0.1 NEAR");
  });

  it("spend to non-member is refused", async () => {
    const daoId = await treasury();
    await handleUpdate(w.deps, w.msg(people.alice, "/spend 0.1 NEAR @nobody x"));
    expect(await w.chain.getProposals(daoId)).toHaveLength(0);
    expect(w.tg.texts().at(-1)).toMatch(/has not joined/);
  });

  it("refuses a spend from someone outside the council", async () => {
    const daoId = await treasury();
    await handleUpdate(w.deps, w.msg(people.eve, "/spend 0.1 NEAR @bob x"));
    expect(await w.chain.getProposals(daoId)).toHaveLength(0);
    expect(w.tg.texts().at(-1)).toMatch(/council/i);
  });

  it("refuses a spend larger than the pot", async () => {
    const daoId = await treasury();
    await handleUpdate(w.deps, w.msg(people.alice, "/spend 5 NEAR @bob x"));
    expect(await w.chain.getProposals(daoId)).toHaveLength(0);
    expect(w.tg.texts().at(-1)).toMatch(/holds/);
  });

  it("refuses USDC on a testnet pot", async () => {
    const daoId = await treasury();
    await handleUpdate(w.deps, w.msg(people.alice, "/spend 1 USDC @bob x"));
    expect(await w.chain.getProposals(daoId)).toHaveLength(0);
    expect(w.tg.texts().at(-1)).toMatch(/NEAR only/);
  });

  it("two council approvals pay out and the result is announced once", async () => {
    const daoId = await treasury();
    await handleUpdate(w.deps, w.msg(people.alice, "/spend 0.1 NEAR @bob pizza"));
    const kind = (await w.chain.getProposal(daoId, 0))!.kind;
    await w.chain.act(w.chain.signer("alice.sponsor.testnet"), daoId, 0, "VoteApprove", kind);
    await w.chain.act(w.chain.signer("bob.sponsor.testnet"), daoId, 0, "VoteApprove", kind);
    const before = w.tg.sent().length;
    expect((await refreshProposal(w.deps, daoId, 0))?.status).toBe("Approved");
    await refreshProposal(w.deps, daoId, 0);
    const announcements = w.tg.sent().slice(before);
    expect(announcements).toHaveLength(1);
    expect(announcements[0].body.text).toMatch(/Paid/);
    expect(announcements[0].body.text).toContain("@bob");
  });

  it("vote notify trusts the chain only", async () => {
    const daoId = await treasury();
    await handleUpdate(w.deps, w.msg(people.alice, "/spend 0.1 NEAR @bob pizza"));
    const kind = (await w.chain.getProposal(daoId, 0))!.kind;
    await w.chain.act(w.chain.signer("alice.sponsor.testnet"), daoId, 0, "VoteApprove", kind);
    const before = w.tg.sent().length;
    expect((await refreshProposal(w.deps, daoId, 0))?.status).toBe("InProgress");
    expect(w.tg.sent().length).toBe(before);
    expect(await refreshProposal(w.deps, daoId, 42)).toBeNull();
    const edits = w.tg.calls.filter((c) => c.method === "editMessageText");
    expect(edits.at(-1)?.body.text).toMatch(/1 of 2/);
  });
});

describe("growing the council", () => {
  it("a late joiner is pending until the council votes them in", async () => {
    const daoId = await treasury();
    const r = await joinPot(w.deps, { ref, tgUser: people.carol, publicKey: w.publicKey() });
    expect(r.role).toBe("pending");
    const p = await w.chain.getProposal(daoId, r.proposalId!);
    const kind: ProposalKind = { AddMemberToRole: { member_id: "carol.sponsor.testnet", role: "council" } };
    expect(p?.kind).toEqual(kind);
    await w.chain.act(w.chain.signer("alice.sponsor.testnet"), daoId, r.proposalId!, "VoteApprove", kind);
    await w.chain.act(w.chain.signer("bob.sponsor.testnet"), daoId, r.proposalId!, "VoteApprove", kind);
    await refreshProposal(w.deps, daoId, r.proposalId!);
    expect((await memberByTg(w.db, CHAT, people.carol.id))?.role).toBe("council");
    expect(votesNeeded(await w.chain.getPolicy(daoId))).toBe(2);
    expect(w.tg.texts().at(-1)).toMatch(/council/);
  });
});

describe("other commands", () => {
  it("/balance and /members answer from the chain and the member list", async () => {
    await treasury();
    await handleUpdate(w.deps, w.msg(people.bob, "/balance"));
    expect(w.tg.texts().at(-1)).toContain("0.2 NEAR");
    await handleUpdate(w.deps, w.msg(people.bob, "/members"));
    expect(w.tg.texts().at(-1)).toContain("alice.sponsor.testnet");
  });

  it("explains itself in a private chat", async () => {
    await handleUpdate(w.deps, w.msg(people.alice, "/start", 101));
    expect(w.tg.texts().at(-1)).toMatch(/group/i);
  });
});
