import { describe, expect, it } from "vitest";
import { botIsProposerOnly, buildPolicy, canAct, councilOf, votesNeeded, type Policy } from "../lib/near/policy.ts";

const BOT = "bot.testnet";
const make = (council: string[]) => buildPolicy({ council, bot: BOT, bondYocto: "10000000000000000000000" });

describe("buildPolicy", () => {
  it("creates exactly a council role and a proposer role for the bot", () => {
    const p = make(["alice.testnet", "bob.testnet"]);
    expect(p.roles).toEqual([
      {
        name: "council",
        kind: { Group: ["alice.testnet", "bob.testnet"] },
        permissions: ["*:VoteApprove", "*:VoteReject", "*:VoteRemove", "*:Finalize", "*:AddProposal"],
        vote_policy: {},
      },
      { name: "proposer", kind: { Group: [BOT] }, permissions: ["transfer:AddProposal", "add_member_to_role:AddProposal"], vote_policy: {} },
    ]);
    expect(p.default_vote_policy).toEqual({ weight_kind: "RoleWeight", quorum: "0", threshold: [1, 2] });
    expect(p.proposal_bond).toBe("10000000000000000000000");
  });
});

describe("canAct", () => {
  const p = make(["alice.testnet", "bob.testnet"]);
  it("lets the bot propose a transfer", () => expect(canAct(p, BOT, "transfer", "AddProposal")).toBe(true));
  it("lets the bot propose a new member", () => expect(canAct(p, BOT, "add_member_to_role", "AddProposal")).toBe(true));
  it("never lets the bot vote", () => expect(canAct(p, BOT, "transfer", "VoteApprove")).toBe(false));
  it("never lets the bot propose a policy change", () => expect(canAct(p, BOT, "change_policy", "AddProposal")).toBe(false));
  it("lets a council member vote on any kind", () => {
    expect(canAct(p, "alice.testnet", "transfer", "VoteApprove")).toBe(true);
    expect(canAct(p, "alice.testnet", "change_policy", "VoteReject")).toBe(true);
  });
  it("gives a stranger nothing", () => expect(canAct(p, "eve.testnet", "transfer", "AddProposal")).toBe(false));
  it("honours an Everyone role", () => {
    const open: Policy = { ...p, roles: [...p.roles, { name: "all", kind: "Everyone", permissions: ["*:AddProposal"], vote_policy: {} }] };
    expect(canAct(open, "eve.testnet", "transfer", "AddProposal")).toBe(true);
  });
});

describe("votesNeeded", () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 3],
  ])("needs a majority of %i council members: %i", (n, needed) => {
    const council = Array.from({ length: n }, (_, i) => `m${i}.testnet`);
    expect(votesNeeded(make(council))).toBe(needed);
  });
});

describe("councilOf", () => {
  it("lists the council group", () => expect(councilOf(make(["a.testnet", "b.testnet"]))).toEqual(["a.testnet", "b.testnet"]));
});

describe("botIsProposerOnly", () => {
  it("passes for the policy we build", () => expect(botIsProposerOnly(make(["a.testnet", "b.testnet"]), BOT)).toEqual({ ok: true, problems: [] }));
  it("fails when the bot sits on the council", () => {
    const r = botIsProposerOnly(make(["a.testnet", BOT]), BOT);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/council/);
  });
  it("fails when anyone can act through an Everyone role", () => {
    const p = make(["a.testnet", "b.testnet"]);
    const open: Policy = { ...p, roles: [...p.roles, { name: "all", kind: "Everyone", permissions: ["*:AddProposal"], vote_policy: {} }] };
    const r = botIsProposerOnly(open, BOT);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/Everyone/);
  });
  it("fails when the bot role may propose a policy change", () => {
    const p = make(["a.testnet", "b.testnet"]);
    const wide: Policy = { ...p, roles: p.roles.map((r) => (r.name === "proposer" ? { ...r, permissions: ["*:AddProposal"] } : r)) };
    expect(botIsProposerOnly(wide, BOT).ok).toBe(false);
  });
});
