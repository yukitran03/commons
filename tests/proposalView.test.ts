import { describe, expect, it } from "vitest";
import { viewKind } from "../lib/proposalView.ts";

const USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

describe("viewKind", () => {
  it("shows a NEAR payment as votable", () => {
    expect(viewKind({ Transfer: { token_id: "", receiver_id: "bob.testnet", amount: "100000000000000000000000" } })).toMatchObject({
      label: "Payment",
      headline: "0.1 NEAR",
      target: "bob.testnet",
      votable: true,
      warning: null,
    });
  });

  it("shows USDC only for the real USDC contract", () => {
    expect(viewKind({ Transfer: { token_id: USDC, receiver_id: "b.near", amount: "25000000" } })).toMatchObject({ headline: "25 USDC", votable: true });
  });

  it("never dresses up an unknown token as USDC and refuses to offer a vote", () => {
    const v = viewKind({ Transfer: { token_id: "evil-token.testnet", receiver_id: "b.testnet", amount: "25000000" } });
    expect(v.headline).toContain("evil-token.testnet");
    expect(v.headline).not.toContain("USDC");
    expect(v.votable).toBe(false);
    expect(v.warning).toBeTruthy();
  });

  it("shows a council member proposal as votable", () => {
    expect(viewKind({ AddMemberToRole: { member_id: "carol.testnet", role: "council" } })).toMatchObject({ label: "New member", target: "carol.testnet", votable: true });
  });

  it.each([
    ["ChangePolicy", { ChangePolicy: { policy: {} } }],
    ["RemoveMemberFromRole", { RemoveMemberFromRole: { member_id: "bob.testnet", role: "council" } }],
    ["FunctionCall", { FunctionCall: { receiver_id: "x.testnet", actions: [] } }],
  ])("labels a %s proposal by its real kind, warns, and offers no vote", (name, kind) => {
    const v = viewKind(kind);
    expect(v.label).toBe(name);
    expect(v.label).not.toBe("New member");
    expect(v.votable).toBe(false);
    expect(v.warning).toMatch(/Commons never files/);
  });
});
