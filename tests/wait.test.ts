import { describe, expect, it } from "vitest";
import { waitForVote } from "../lib/pot.ts";
import type { Chain, Proposal } from "../lib/near/chain.ts";

const proposal = (votes: Proposal["votes"], status: Proposal["status"] = "InProgress"): Proposal => ({
  id: 3,
  proposer: "bot.testnet",
  description: "x",
  kind: { Transfer: { token_id: "", receiver_id: "b.testnet", amount: "1" } },
  status,
  vote_counts: {},
  votes,
  submission_time: "0",
});

function lagging(answers: (Proposal | null)[]) {
  let calls = 0;
  const chain = { getProposal: async () => answers[Math.min(calls++, answers.length - 1)] } as unknown as Chain;
  return { chain, calls: () => calls };
}

describe("waitForVote", () => {
  it("keeps reading while the RPC node has not seen the member's vote yet", async () => {
    const { chain, calls } = lagging([null, proposal({}), proposal({ "alice.testnet": "Approve" })]);
    const p = await waitForVote(chain, "dao", 3, "alice.testnet", { tries: 5, delayMs: 1 });
    expect(p?.votes["alice.testnet"]).toBe("Approve");
    expect(calls()).toBe(3);
  });

  it("stops at a final status even without the vote", async () => {
    const { chain, calls } = lagging([proposal({}, "Approved")]);
    expect((await waitForVote(chain, "dao", 3, "alice.testnet", { tries: 5, delayMs: 1 }))?.status).toBe("Approved");
    expect(calls()).toBe(1);
  });

  it("gives up after the last try and returns what it saw", async () => {
    const { chain, calls } = lagging([proposal({})]);
    expect((await waitForVote(chain, "dao", 3, "alice.testnet", { tries: 3, delayMs: 1 }))?.votes).toEqual({});
    expect(calls()).toBe(3);
  });
});
