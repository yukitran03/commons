// The demo story, run against FakeChain (npm run demo) or NEAR testnet (npm run demo:testnet).
// Members' keys are generated here, standing in for each member's phone; the bot only ever uses its own key.
import { KeyPair } from "near-api-js";
import { handleUpdate } from "../lib/bot/handlers.ts";
import { createTreasury, joinPot, refreshProposal, waitForVote, type Deps } from "../lib/pot.ts";
import { memberByTg, potByChat } from "../lib/db.ts";
import { botIsProposerOnly, buildPolicy, councilOf } from "../lib/near/policy.ts";
import { NEAR, type ProposalKind, type Signer } from "../lib/near/chain.ts";
import { signInitData, verifyInitData } from "../lib/tgauth.ts";
import { fromUnits } from "../lib/tokens.ts";
import { steps } from "../lib/demo.ts";

const CHAT = -1009876543210;
const people = {
  alice: { id: 7001, first_name: "Alice", username: "alice_cm" },
  bob: { id: 7002, first_name: "Bob", username: "bob_cm" },
  carol: { id: 7003, first_name: "Carol", username: "carol_cm" },
};

export interface StoryResult {
  failed: number;
  daoId: string | null;
  txs: { label: string; hash: string }[];
  accounts: Record<string, string>;
}

export async function story(o: { deps: Deps; signerFor: (accountId: string, secret: string) => Signer; print: (l: string) => void; title: string }): Promise<StoryResult> {
  const { deps, print } = o;
  const s = steps(print);
  const txs: StoryResult["txs"] = [];
  const accounts: Record<string, string> = {};
  const signers: Record<string, Signer> = {};
  let update = 1;
  const msg = (from: (typeof people)[keyof typeof people], text: string) => ({
    update_id: update++,
    message: { message_id: update, from, chat: { id: CHAT, type: "supergroup", title: o.title }, date: Math.floor(Date.now() / 1000), text },
  });
  let ref = "";
  let daoId: string | null = null;
  const near = (y: bigint) => `${fromUnits(y, 24)} NEAR`;

  async function join(who: keyof typeof people) {
    const kp = KeyPair.fromRandom("ed25519"); // this would happen on the member's phone
    const r = await joinPot(deps, { ref, tgUser: people[who], publicKey: kp.getPublicKey().toString() });
    accounts[who] = r.accountId;
    signers[who] = o.signerFor(r.accountId, kp.toString());
    if (r.txHash) txs.push({ label: `create account ${r.accountId}`, hash: r.txHash });
    return r;
  }
  // RPC nodes can lag a block behind the one that ran a transaction, so reads right after a write may retry.
  async function readable(id: number) {
    for (let i = 0; i < 10; i++) {
      const p = await deps.chain.getProposal(daoId!, id);
      if (p) return p;
      await new Promise((r) => setTimeout(r, 800));
    }
    throw new Error(`proposal #${id} never became readable`);
  }
  async function approve(who: keyof typeof people, id: number) {
    const p = await readable(id);
    const r = await deps.chain.act(signers[who], daoId!, id, "VoteApprove", p.kind);
    txs.push({ label: `${who} approves #${id}`, hash: r.txHash });
    await waitForVote(deps.chain, daoId!, id, accounts[who]); // what /api/vote does after a Mini App vote
  }

  await s.step("Someone sends /commons in the Telegram group", async () => {
    await handleUpdate(deps, msg(people.alice, "/commons"));
    ref = (await potByChat(deps.db, CHAT))!.ref;
    return `pot ref ${ref}`;
  });

  await s.step("Alice and Bob tap Join: each gets a named NEAR account, the key stays on their own device", async () => {
    await join("alice");
    await join("bob");
    s.check(await deps.chain.accountExists(accounts.alice), "alice's account missing");
    s.check(await deps.chain.accountExists(accounts.bob), "bob's account missing");
    return `${accounts.alice}, ${accounts.bob}`;
  });

  await s.step("Alice taps Create treasury: a Sputnik DAO with Alice and Bob as council, the bot as proposer only", async () => {
    const r = await createTreasury(deps, CHAT, people.alice.id);
    daoId = r.daoId;
    txs.push({ label: `create DAO ${daoId}`, hash: r.txHash });
    const policy = await deps.chain.getPolicy(daoId);
    // The contract stores the council as a set, so compare without order.
    s.check(JSON.stringify(councilOf(policy).sort()) === JSON.stringify([accounts.alice, accounts.bob].sort()), "council is not alice and bob");
    const check = botIsProposerOnly(policy, deps.bot.accountId);
    s.check(check.ok, check.problems.join("; "));
    return daoId;
  });

  await s.step("Alice chips in 0.2 NEAR from her own account", async () => {
    const r = await deps.chain.transfer(signers.alice, daoId!, 2n * 10n ** 23n);
    txs.push({ label: "alice chips in 0.2 NEAR", hash: r.txHash });
    return `pot holds ${near(await deps.chain.balance(daoId!))}`;
  });

  let pizza = -1;
  await s.step("Alice asks in the chat: /spend 0.1 NEAR @bob_cm pizza for demo night", async () => {
    await handleUpdate(deps, msg(people.alice, "/spend 0.1 NEAR @bob_cm pizza for demo night"));
    const ps = await deps.chain.getProposals(daoId!);
    const p = ps.at(-1);
    s.check(p && "Transfer" in p.kind && p.proposer === deps.bot.accountId, "no transfer proposal from the bot");
    pizza = p!.id;
    return `proposal #${pizza} filed by ${p!.proposer}`;
  });

  await s.step("Alice and Bob approve on their phones; the DAO pays Bob", async () => {
    const before = await deps.chain.balance(accounts.bob);
    await approve("alice", pizza);
    await approve("bob", pizza);
    const p = await refreshProposal(deps, daoId!, pizza);
    s.check(p?.status === "Approved", `status is ${p?.status}`);
    const delta = (await deps.chain.balance(accounts.bob)) - before;
    s.check(delta > 9n * 10n ** 22n, `bob received only ${near(delta)}`);
    return `bob's balance went up by ${near(delta)} (0.1 NEAR minus his own gas)`;
  });

  await s.step("Carol joins late: she is pending and the bot files an AddMemberToRole proposal", async () => {
    const r = await join("carol");
    s.check(r.role === "pending" && r.proposalId !== undefined, `carol is ${r.role}`);
    await approve("alice", r.proposalId!);
    await approve("bob", r.proposalId!);
    await refreshProposal(deps, daoId!, r.proposalId!);
    s.check((await memberByTg(deps.db, CHAT, people.carol.id))?.role === "council", "carol is not on the council in the bot's records");
    s.check(councilOf(await deps.chain.getPolicy(daoId!)).includes(accounts.carol), "carol is not on the council in the contract");
    return "the council voted Carol in";
  });

  let drain = -1;
  const holds = await deps.chain.balance(daoId!).catch(() => 0n);
  await s.step("Attack: whoever holds the bot's key drafts a payment to the bot itself", async () => {
    const kind: ProposalKind = { Transfer: { token_id: "", receiver_id: deps.bot.accountId, amount: (holds > 0n ? holds : NEAR).toString() } };
    drain = (await deps.chain.addProposal(deps.bot, daoId!, "send everything to the bot", kind)).id;
    return `proposal #${drain} exists, but only the council can approve it`;
  });

  await s.step("Attack: the bot tries to approve its own drain proposal", async () => {
    const p = await readable(drain);
    return `contract refused: ${await s.expectReject(deps.chain.act(deps.bot, daoId!, drain, "VoteApprove", p.kind), /ERR_PERMISSION_DENIED/)}`;
  });

  await s.step("Attack: the bot proposes a new policy that makes itself the council", async () => {
    const evil = buildPolicy({ council: [deps.bot.accountId], bot: deps.bot.accountId, bondYocto: (10n ** 22n).toString() });
    return `contract refused: ${await s.expectReject(deps.chain.addProposal(deps.bot, daoId!, "new rules", { ChangePolicy: { policy: evil } }), /ERR_PERMISSION_DENIED/)}`;
  });

  await s.step("After the attacks the drain proposal is still unpaid and the pot still holds its money", async () => {
    const p = await deps.chain.getProposal(daoId!, drain);
    s.check(p?.status === "InProgress", `drain proposal is ${p?.status}`);
    const now = await deps.chain.balance(daoId!);
    s.check(now >= holds, `pot dropped from ${near(holds)} to ${near(now)}`);
    return `pot holds ${near(now)}`;
  });

  await s.step("A forged Mini App request (signed with the wrong bot token) is refused", async () => {
    const forged = signInitData({ user: JSON.stringify({ id: people.alice.id, username: "alice_cm" }), auth_date: String(Math.floor(Date.now() / 1000)) }, "000:not-the-bot-token");
    const r = verifyInitData(forged, "1234567890:AAFakeTokenForDemoOnly", Math.floor(Date.now() / 1000));
    s.check(!r.ok, "forged initData was accepted");
    return `refused: ${(r as { reason: string }).reason}`;
  });

  return { failed: s.failed, daoId, txs, accounts };
}
