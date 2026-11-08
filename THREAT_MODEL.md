# Threat model

What Commons protects, who might attack it, and what stops them. "Contract" means the group's Sputnik DAO v2 on NEAR.

## Assets

- The pot: NEAR (and on mainnet, USDC) held by the group's DAO account.
- Each member's key, which is their vote and controls the NEAR in their own account.
- The record of who approved what.

## Who holds which key

| Key | Held by | Can do |
|---|---|---|
| Member key (full access to `<name>.<sponsor>`) | The member's phone only (Telegram SecureStorage, else browser localStorage) | Vote, chip in from their own account |
| Bot key | Our server | `add_proposal` for transfers and new members, nothing else in any DAO |
| Sponsor key | Our server | Create member accounts and DAOs, pay their storage |

The sponsor is the parent of member accounts, but on NEAR a parent account has no power over a sub-account once it exists.

## Threats

**Our server is taken over.** The attacker gets the bot key and the sponsor key. With the bot key they can file proposals, including "send everything to me". They cannot approve them: the bot's only role is `proposer` with `transfer:AddProposal` and `add_member_to_role:AddProposal`, and the contract refuses its votes with `ERR_PERMISSION_DENIED`. They cannot propose a policy change for the same reason. They could add themselves through an `AddMemberToRole` proposal, which the council still has to approve. With the sponsor key they can spend the sponsor's own NEAR (create junk accounts or DAOs) but cannot touch any pot. Shown by `npm run demo` steps 8 to 11 and checked live by `npm run verify`.

**The bot lies in the chat.** It could post a fake "Paid" message. Every card links to the public ledger, which reads the contract directly, and members vote on what the Mini App reads from the chain (`get_proposal`), not on what the bot says.

**A forged Mini App request.** `/api/join` and `/api/vote` check Telegram's `initData` signature (HMAC with the bot token) and reject data older than 24 hours. Demo identities only work when `DEMO_MODE=1` on testnet. `/api/vote` cannot change anything: it only makes the server re-read a proposal from the chain.

**A spoofed webhook.** `/api/telegram` requires the secret token set with `setWebhook` and compares it in constant time.

**Someone takes over a member's Telegram account.** They can use Telegram but not the member's key, which sits on the member's phone. On a new device they would have to join again, which creates a different account that the council must vote in.

**A malicious council member.** One member cannot move money alone; the threshold is a majority (floor(n/2)+1). A majority acting together can, by design.

**A lost phone.** The member's vote is gone with the key unless they backed it up from the Mini App. The council can remove and re-add them with `RemoveMemberFromRole` and `AddMemberToRole`. While the council is small (2 of 2), one lost key blocks payments until it is replaced; groups should have at least three members.

**Spam joins drain the sponsor.** Each join costs the sponsor 0.5 NEAR. One Telegram user gets one account per group, but can join many groups. Not rate limited yet.

**A lagging RPC node.** Reads right after a write can be one block behind. Results are posted only after the server sees the voter's own vote or a final status (`waitForVote`), and it never posts a status the chain has not reported.

**Intents deposits.** A testnet pot never receives a deposit address. Live cross-chain deposits need mainnet, `INTENTS_LIVE=1`, and the member's own refund address on the source chain; refunds go there, not to us.

## Out of scope

Bugs in the Sputnik DAO contract itself, in NEAR, in Telegram's SecureStorage, or in the 1Click service.
