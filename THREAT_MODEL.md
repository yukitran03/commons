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

**The bot key or the sponsor key leaks.** With the bot key an attacker can file proposals, including "send everything to me". They cannot approve them: the bot's only role is `proposer` with `transfer:AddProposal` and `add_member_to_role:AddProposal`, and the contract refuses its votes with `ERR_PERMISSION_DENIED`. They cannot propose a policy change for the same reason. They could propose adding themselves, which the council still has to approve. With the sponsor key they can spend the sponsor's own NEAR (create junk accounts or DAOs) but cannot touch any pot. Shown by `npm run demo` steps 8 to 11, by failed testnet transactions listed in the README, and checked live by `npm run verify`.

**The whole deployment is taken over, web app included.** This is worse than a leaked key, and we say so plainly. The same server serves the Mini App's JavaScript, so an attacker could ship code that reads a member's key from Telegram SecureStorage or localStorage the next time they open it, and sign approvals with it. What limits this today: the code is open source, each member's vote still needs their phone to load the page, and the Mini App checks on chain (`view_access_key`) that a new account holds the key the phone itself created, so a server cannot quietly register its own key at join time. What would remove it: signing with a wallet the member already trusts (NEAR Connect), listed under Not implemented.

**The bot lies in the chat.** It could post a fake "Paid" message. Every card links to the public ledger, which reads the contract directly, and members vote on what the Mini App reads from the chain (`get_proposal`), not on what the bot says.

**A council member disguises a proposal.** Council members can file any proposal kind in a Sputnik UI, for example a policy change described as "add Carol". The Mini App builds the vote screen from the proposal's kind on chain, never from its description, offers a vote only on the kinds Commons files itself (NEAR or USDC payments, adding a council member), and shows anything else as raw JSON with a warning.

**A forged Mini App request.** `/api/join` and `/api/vote` check Telegram's `initData` signature (HMAC with the bot token) and reject data older than 24 hours. Demo identities only work when `DEMO_MODE=1` on testnet. `/api/vote` cannot change anything: it only makes the server re-read a proposal from the chain.

**A spoofed webhook.** `/api/telegram` requires the secret token set with `setWebhook` and compares it in constant time.

**Someone takes over a member's Telegram account.** They can use Telegram but not the member's key, which sits on the member's phone. Joining again from their own device returns the existing account, and the Mini App's on-chain key check then tells them this device does not hold its key, so they cannot vote with it.

**A join link leaks outside the group.** Links are not invitations: the bot asks Telegram (`getChatMember`) whether the person is in the group before creating an account.

**A malicious council member.** One member cannot move money alone; the threshold is a majority (floor(n/2)+1). A majority acting together can, by design.

**A lost phone.** The member's vote is gone with the key unless they backed it up from the Mini App. The council can remove and re-add them with `RemoveMemberFromRole` and `AddMemberToRole`. While the council is small (2 of 2), one lost key blocks payments until it is replaced; groups should have at least three members.

**Spam joins drain the sponsor.** Each join costs the sponsor 0.5 NEAR. One Telegram user gets one account per group and must be in that group, but can join many groups. Not rate limited yet.

**A lagging RPC node.** Reads right after a write can be one block behind. Results are posted only after the server sees the voter's own vote or a final status (`waitForVote`), and it never posts a status the chain has not reported.

**Intents deposits.** A testnet pot never receives a deposit address. Live cross-chain deposits need mainnet, `INTENTS_LIVE=1`, and the member's own refund address on the source chain; refunds go there, not to us.

## Out of scope

Bugs in the Sputnik DAO contract itself, in NEAR, in Telegram's SecureStorage, or in the 1Click service.
