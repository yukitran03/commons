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

describe("review fixes", () => {
  it("only members of the Telegram group can join", async () => {
    await setup();
    w.tg.outsiders.add(people.eve.id);
    await expect(joinPot(w.deps, { ref, tgUser: people.eve, publicKey: w.publicKey() })).rejects.toThrow(/members of the Telegram group/);
    expect(await w.chain.accountExists("eve.sponsor.testnet")).toBe(false);
    expect(await memberByTg(w.db, CHAT, people.eve.id)).toBeNull();
  });

  it("concurrent joins by the same person create one account and agree on it", async () => {
    await setup();
    const [a, b] = await Promise.all([
      joinPot(w.deps, { ref, tgUser: people.alice, publicKey: w.publicKey() }),
      joinPot(w.deps, { ref, tgUser: people.alice, publicKey: w.publicKey() }),
    ]);
    expect(a.accountId).toBe(b.accountId);
    expect([a.existing, b.existing].filter(Boolean)).toHaveLength(1);
    expect(await w.chain.accountExists("alice-0101.sponsor.testnet")).toBe(false);
    expect(await w.chain.balance("sponsor.testnet")).toBe(100n * NEAR - 5n * 10n ** 23n);
  });

  it("someone who joins while the treasury is being created is not left out", async () => {
    await setup();
    await joinFounders();
    const original = w.chain.createDao.bind(w.chain);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    w.chain.createDao = async (...args: Parameters<typeof original>) => {
      await gate;
      return original(...args);
    };
    const creating = createTreasury(w.deps, CHAT, people.alice.id);
    await new Promise((r) => setTimeout(r, 20));
    const joining = joinPot(w.deps, { ref, tgUser: people.carol, publicKey: w.publicKey() });
    await new Promise((r) => setTimeout(r, 20));
    release();
    const { daoId } = await creating;
    await joining;
    const policy = await w.chain.getPolicy(daoId);
    const carol = await memberByTg(w.db, CHAT, people.carol.id);
    const onCouncil = councilOf(policy).includes(carol!.account_id);
    const open = (await w.chain.getProposals(daoId)).filter(
      (p) => p.status === "InProgress" && "AddMemberToRole" in p.kind && p.kind.AddMemberToRole.member_id === carol!.account_id,
    );
    expect(onCouncil || (carol!.role === "pending" && open.length === 1)).toBe(true);
  });

  it("a late joiner whose council proposal failed gets one filed on retry", async () => {
    const daoId = await treasury();
    const original = w.chain.addProposal.bind(w.chain);
    let fail = true;
    w.chain.addProposal = async (...args: Parameters<typeof original>) => {
      if (fail) {
        fail = false;
        throw new Error("rpc hiccup");
      }
      return original(...args);
    };
    const key = w.publicKey();
    await expect(joinPot(w.deps, { ref, tgUser: people.carol, publicKey: key })).rejects.toThrow("rpc hiccup");
    const r = await joinPot(w.deps, { ref, tgUser: people.carol, publicKey: key });
    expect(r.proposalId).toBeDefined();
    const open = (await w.chain.getProposals(daoId)).filter((p) => "AddMemberToRole" in p.kind && p.status === "InProgress");
    expect(open).toHaveLength(1);
  });

  it("a deleted vote card does not stop the result being announced", async () => {
    const daoId = await treasury();
    const r = await joinPot(w.deps, { ref, tgUser: people.carol, publicKey: w.publicKey() });
    const kind = (await w.chain.getProposal(daoId, r.proposalId!))!.kind;
    await w.chain.act(w.chain.signer("alice.sponsor.testnet"), daoId, r.proposalId!, "VoteApprove", kind);
    await w.chain.act(w.chain.signer("bob.sponsor.testnet"), daoId, r.proposalId!, "VoteApprove", kind);
    w.tg.failEdits.on = true;
    await refreshProposal(w.deps, daoId, r.proposalId!);
    expect((await memberByTg(w.db, CHAT, people.carol.id))?.role).toBe("council");
    expect(w.tg.texts().at(-1)).toMatch(/now on the council/);
  });

  it("the chain decides who may ask for money, and /commons repairs stale roles", async () => {
    const daoId = await treasury();
    const { setRole } = await import("../lib/db.ts");
    await setRole(w.db, CHAT, people.bob.id, "pending"); // stale record, bob is on the council on chain
    await handleUpdate(w.deps, w.msg(people.bob, "/spend 0.1 NEAR @alice taxi"));
    expect(await w.chain.getProposals(daoId)).toHaveLength(1);
    await handleUpdate(w.deps, w.msg(people.bob, "/commons"));
    expect((await memberByTg(w.db, CHAT, people.bob.id))?.role).toBe("council");
  });

  it("keeps <name>.<sponsor> within 64 characters for a long sponsor id", async () => {
    w = await world("commons-sponsor-mw7abcdefgh.testnet");
    await setup();
    const a = await joinPot(w.deps, { ref, tgUser: { id: 5, username: "a_really_long_telegram_handle_x" }, publicKey: w.publicKey() });
    const b = await joinPot(w.deps, { ref, tgUser: { id: 98761234, first_name: "Maximilian Alexander Johnson" }, publicKey: w.publicKey() });
    for (const id of [a.accountId, b.accountId]) {
      expect(id.length).toBeLessThanOrEqual(64);
      expect(await w.chain.accountExists(id)).toBe(true);
    }
  });
});

describe("sponsor running low", () => {
  it("says clearly that treasury creation is paused when the sponsor cannot pay for a DAO", async () => {
    await setup();
    await joinFounders();
    const left = await w.chain.balance("sponsor.testnet");
    await w.chain.transfer(w.chain.signer("sponsor.testnet"), "elsewhere.testnet", left - 3n * NEAR); // leave 3 NEAR
    await handleUpdate(w.deps, w.tap(people.alice, "create"));
    expect((await potByChat(w.db, CHAT))?.dao_id).toBeNull();
    const answer = w.tg.calls.filter((c) => c.method === "answerCallbackQuery").at(-1);
    expect(answer?.body.text).toMatch(/testnet NEAR/);
  });

  it("says clearly that joining is paused when the sponsor cannot fund an account", async () => {
    await setup();
    const left = await w.chain.balance("sponsor.testnet");
    await w.chain.transfer(w.chain.signer("sponsor.testnet"), "elsewhere.testnet", left - 10n ** 23n); // leave 0.1 NEAR
    await expect(joinPot(w.deps, { ref, tgUser: people.alice, publicKey: w.publicKey() })).rejects.toThrow(/testnet NEAR/);
    expect(await memberByTg(w.db, CHAT, people.alice.id)).toBeNull();
  });
});
