// The pot: joining, creating the treasury, drafting payments and reporting what the chain decided.
// The bot signs only as the DAO's "proposer". Votes are signed by members on their own devices (Mini App).
import {
  addMember,
  markAnnounced,
  memberByAccount,
  memberByTg,
  memberByUsername,
  members,
  potByChat,
  potByDao,
  potByRef,
  proposalRow,
  saveProposal,
  setDao,
  setRole,
  type Db,
  type MemberRow,
  type PotRow,
} from "./db.ts";
import { copy, UserError, who } from "./bot/copy.ts";
import { parseSpend } from "./bot/parse.ts";
import { accountName, daoName } from "./near/names.ts";
import { buildPolicy, councilOf, votesNeeded, type Policy } from "./near/policy.ts";
import { kindName, type Chain, type Proposal, type ProposalKind, type Signer } from "./near/chain.ts";
import { accountUrl, type Network } from "./near/config.ts";
import { TOKENS, fromUnits, toUnits, type TokenSymbol } from "./tokens.ts";
import { chipPayload, joinPayload, miniAppLink, send, edit, votePayload, type Kb, type Tg } from "./telegram.ts";
import type { TgUser } from "./tgauth.ts";

export interface Deps {
  db: Db;
  tg: Tg;
  chain: Chain;
  sponsor: Signer;
  bot: Signer;
  cfg: { network: Network; botUsername: string; appShortName: string; appUrl: string; explorer: string };
}

const BOND_YOCTO = (10n ** 22n).toString(); // 0.01 NEAR, returned when a proposal closes
const ED25519 = /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/;
const FINAL = new Set(["Approved", "Rejected", "Failed", "Expired", "Removed", "Moved"]);

// One action per chat at a time inside this process (double taps, webhook retries).
const locks = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(key, next);
  next.finally(() => locks.get(key) === next && locks.delete(key)).catch(() => {});
  return next;
}

const link = (d: Deps, payload: string) => miniAppLink({ botUsername: d.cfg.botUsername, appShortName: d.cfg.appShortName, appUrl: d.cfg.appUrl, payload });
export const ledgerUrl = (d: Deps, daoId: string) => `${d.cfg.appUrl.replace(/\/$/, "")}/c/${daoId}`;
const display = (u: TgUser) => u.first_name || u.username || "Member";

export function tokenOf(tokenId: string): { symbol: TokenSymbol; decimals: number } {
  if (tokenId === "") return { symbol: "NEAR", decimals: TOKENS.NEAR.decimals };
  if (tokenId === TOKENS.USDC.tokenId.mainnet) return { symbol: "USDC", decimals: TOKENS.USDC.decimals };
  return { symbol: tokenId as TokenSymbol, decimals: 0 };
}
export const fmtNear = (yocto: bigint) => `${fromUnits(yocto, 24)} NEAR`;

export function setupKeyboard(d: Deps, pot: PotRow, founders: number): Kb {
  const kb: Kb = [[{ text: "Join", url: link(d, joinPayload(pot.ref)) }]];
  if (!pot.dao_id && founders >= 2) kb.push([{ text: `Create treasury (${founders} founders)`, callback_data: "create" }]);
  if (pot.dao_id) kb.push([{ text: "Chip in", url: link(d, chipPayload(pot.ref)) }, { text: "Ledger", url: ledgerUrl(d, pot.dao_id) }]);
  return kb;
}

/** /commons: the setup card before the treasury exists, the status card after. */
export async function potCard(d: Deps, chatId: number, title: string): Promise<{ text: string; kb: Kb }> {
  const pot = (await potByChat(d.db, chatId))!;
  const ms = await members(d.db, chatId);
  const founders = ms.filter((m) => m.role === "founder").length;
  if (!pot.dao_id) return { text: copy.setup(title, ms.map((m) => who(m))), kb: setupKeyboard(d, pot, founders) };
  const policy = await d.chain.getPolicy(pot.dao_id);
  const holds = fmtNear(await d.chain.balance(pot.dao_id));
  return {
    text: copy.status({ title, daoId: pot.dao_id, holds, council: councilOf(policy).length, needed: votesNeeded(policy), pending: ms.filter((m) => m.role === "pending").length }),
    kb: setupKeyboard(d, pot, founders),
  };
}

async function freeName(d: Deps, u: TgUser): Promise<string> {
  const base = accountName(u);
  const tail = String(Math.abs(u.id) % 10_000).padStart(4, "0");
  const rand = () => Math.random().toString(36).slice(2, 6);
  for (const name of [base, base.endsWith(`-${tail}`) ? `${base}-${rand()}` : `${base}-${tail}`, `${base}-${rand()}`]) {
    const id = `${name}.${d.sponsor.accountId}`;
    if (!(await memberByAccount(d.db, id)) && !(await d.chain.accountExists(id))) return name;
  }
  throw new Error("no free account name");
}

export async function joinPot(
  d: Deps,
  o: { ref: string; tgUser: TgUser; publicKey: string },
): Promise<{ accountId: string; role: MemberRow["role"]; txHash: string; proposalId?: number; existing?: boolean }> {
  if (!ED25519.test(o.publicKey)) throw new UserError(copy.err.badKey);
  const pot = await potByRef(d.db, o.ref);
  if (!pot) throw new UserError(copy.err.unknownPot);
  return serial(`join:${pot.chat_id}:${o.tgUser.id}`, async () => {
    const existing = await memberByTg(d.db, pot.chat_id, o.tgUser.id);
    if (existing) return { accountId: existing.account_id, role: existing.role, txHash: "", existing: true };

    const name = await freeName(d, o.tgUser);
    const { accountId, txHash } = await d.chain.createMemberAccount(d.sponsor, name, o.publicKey);
    const fresh = await potByChat(d.db, pot.chat_id);
    const role = fresh?.dao_id ? "pending" : "founder";
    await addMember(d.db, { chatId: pot.chat_id, tgUserId: o.tgUser.id, tgUsername: o.tgUser.username, display: display(o.tgUser), accountId, publicKey: o.publicKey, role });
    const me = (await memberByTg(d.db, pot.chat_id, o.tgUser.id))!;

    if (role === "founder") {
      const founders = (await members(d.db, pot.chat_id)).filter((m) => m.role === "founder").length;
      await send(d.tg, pot.chat_id, copy.joinedFounder(who(me), accountId, founders), setupKeyboard(d, fresh!, founders));
      return { accountId, role, txHash };
    }

    const kind: ProposalKind = { AddMemberToRole: { member_id: accountId, role: "council" } };
    const { id } = await d.chain.addProposal(d.bot, fresh!.dao_id!, `Add ${me.tg_username ? "@" + me.tg_username : me.display} (${accountId}) to the council`, kind);
    const policy = await d.chain.getPolicy(fresh!.dao_id!);
    const msg = await send(
      d.tg,
      pot.chat_id,
      copy.memberCard({ id, who: who(me), accountId, approvals: [], needed: votesNeeded(policy), status: "InProgress" }),
      voteKeyboard(d, fresh!, id),
    );
    await saveProposal(d.db, { daoId: fresh!.dao_id!, proposalId: id, chatId: pot.chat_id, tgMessageId: msg?.message_id ?? null, kind: "add_member_to_role", summary: accountId });
    return { accountId, role, txHash, proposalId: id };
  });
}

function voteKeyboard(d: Deps, pot: PotRow, id: number): Kb {
  return [[{ text: "Review and vote", url: link(d, votePayload(pot.ref, id)) }], [{ text: "Ledger", url: ledgerUrl(d, pot.dao_id!) }]];
}

export async function createTreasury(d: Deps, chatId: number, requestedBy: number): Promise<{ daoId: string; txHash: string; created: boolean }> {
  return serial(`create:${chatId}`, async () => {
    const pot = await potByChat(d.db, chatId);
    if (!pot) throw new UserError(copy.err.noPot);
    if (pot.dao_id) return { daoId: pot.dao_id, txHash: "", created: false };
    const ms = await members(d.db, chatId);
    const founders = ms.filter((m) => m.role === "founder");
    if (!founders.some((m) => m.tg_user_id === requestedBy)) throw new UserError(copy.err.notJoined);
    if (founders.length < 2) throw new UserError(copy.err.needTwo);

    const policy = buildPolicy({ council: founders.map((m) => m.account_id), bot: d.bot.accountId, bondYocto: BOND_YOCTO });
    const { daoId, txHash } = await d.chain.createDao(d.sponsor, daoName(pot.title, pot.ref), `Treasury of the Telegram group "${pot.title}", run with Commons.`, policy);
    if (!(await setDao(d.db, chatId, daoId))) return { daoId: (await potByChat(d.db, chatId))!.dao_id!, txHash, created: false };
    for (const m of founders) await setRole(d.db, chatId, m.tg_user_id, "council");
    const kb: Kb = [[{ text: "Chip in", url: link(d, chipPayload(pot.ref)) }, { text: "Ledger", url: ledgerUrl(d, daoId) }]];
    await send(d.tg, chatId, copy.created(daoId, founders.map((m) => who(m)), votesNeeded(policy)), kb);
    return { daoId, txHash, created: true };
  });
}

/** /spend: validate everything we can before the bot pays a proposal bond. */
export async function proposeSpend(d: Deps, chatId: number, from: TgUser, text: string): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const pot = await potByChat(d.db, chatId);
  if (!pot?.dao_id) return { ok: false, error: copy.err.noDao };
  const asker = await memberByTg(d.db, chatId, from.id);
  if (asker?.role !== "council") return { ok: false, error: copy.err.notCouncil };
  const req = parseSpend(text);
  if (!req.ok) return { ok: false, error: req.error };

  const tokenId = TOKENS[req.token].tokenId[d.cfg.network];
  if (tokenId === null) return { ok: false, error: copy.err.testnetNearOnly };

  let receiver: string;
  let to: string;
  if (req.to.startsWith("@")) {
    const m = await memberByUsername(d.db, chatId, req.to);
    if (!m) return { ok: false, error: copy.err.notMember(req.to) };
    receiver = m.account_id;
    to = who(m);
  } else {
    if (!(await d.chain.accountExists(req.to))) return { ok: false, error: copy.err.noAccount(req.to, d.cfg.network) };
    const m = await memberByAccount(d.db, req.to);
    receiver = req.to;
    to = m ? who(m) : `<code>${req.to}</code>`;
  }

  const units = toUnits(req.amount, TOKENS[req.token].decimals);
  const asked = `${fromUnits(units, TOKENS[req.token].decimals, 6)} ${req.token}`;
  if (req.token === "NEAR") {
    const holds = await d.chain.balance(pot.dao_id);
    if (holds < units) return { ok: false, error: copy.err.tooMuch(fmtNear(holds), asked) };
  }

  const kind: ProposalKind = { Transfer: { token_id: tokenId, receiver_id: receiver, amount: units.toString() } };
  const askedBy = asker.tg_username ? `@${asker.tg_username}` : asker.display;
  const { id } = await d.chain.addProposal(d.bot, pot.dao_id, `${req.reason || "Payment"} (asked by ${askedBy} in Telegram)`, kind);
  const policy = await d.chain.getPolicy(pot.dao_id);
  const msg = await send(
    d.tg,
    chatId,
    copy.paymentCard({ id, amount: asked, to, accountId: receiver, reason: req.reason, askedBy: who(asker), approvals: [], needed: votesNeeded(policy), status: "InProgress" }),
    voteKeyboard(d, pot, id),
  );
  await saveProposal(d.db, { daoId: pot.dao_id, proposalId: id, chatId, tgMessageId: msg?.message_id ?? null, kind: "transfer", summary: JSON.stringify({ asked, to, reason: req.reason, askedBy: who(asker) }) });
  return { ok: true, id };
}

/**
 * RPC nodes can lag a block or two behind the one that ran a member's vote. Re-reads until that member's vote (or a
 * final status) is visible, so the card we post is not stale. Only decides how long to wait, never what to report.
 */
export async function waitForVote(chain: Chain, daoId: string, id: number, accountId: string, o: { tries?: number; delayMs?: number } = {}): Promise<Proposal | null> {
  const tries = o.tries ?? 8;
  let p: Proposal | null = null;
  for (let i = 0; i < tries; i++) {
    p = await chain.getProposal(daoId, id).catch(() => null);
    if (p && (p.votes[accountId] || FINAL.has(p.status))) return p;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, o.delayMs ?? 750));
  }
  return p;
}

async function nameOf(d: Deps, accountId: string): Promise<string> {
  return who(await memberByAccount(d.db, accountId), `<code>${accountId}</code>`);
}

/**
 * Reads a proposal from the chain, updates its card and announces a final result once. Called after a member votes;
 * whatever the caller claims, only the chain's state is reported.
 */
export async function refreshProposal(d: Deps, daoId: string, id: number): Promise<Proposal | null> {
  const p = await d.chain.getProposal(daoId, id);
  if (!p) return null;
  const pot = await potByDao(d.db, daoId);
  if (!pot) return p;
  const policy: Policy = await d.chain.getPolicy(daoId);
  const council = councilOf(policy);
  const approvers = await Promise.all(Object.entries(p.votes).filter(([a, v]) => v === "Approve" && council.includes(a)).map(([a]) => nameOf(d, a)));
  const row = await proposalRow(d.db, daoId, id);
  const needed = votesNeeded(policy);

  let card: string;
  if ("Transfer" in p.kind) {
    const t = tokenOf(p.kind.Transfer.token_id);
    const meta = row?.summary?.startsWith("{") ? JSON.parse(row.summary) : null;
    card = copy.paymentCard({
      id,
      amount: meta?.asked ?? `${fromUnits(p.kind.Transfer.amount, t.decimals, 6)} ${t.symbol}`,
      to: meta?.to ?? (await nameOf(d, p.kind.Transfer.receiver_id)),
      accountId: p.kind.Transfer.receiver_id,
      reason: meta?.reason ?? p.description,
      askedBy: meta?.askedBy ?? (await nameOf(d, p.proposer)),
      approvals: approvers,
      needed,
      status: p.status,
    });
  } else if ("AddMemberToRole" in p.kind) {
    card = copy.memberCard({ id, who: await nameOf(d, p.kind.AddMemberToRole.member_id), accountId: p.kind.AddMemberToRole.member_id, approvals: approvers, needed, status: p.status });
  } else {
    card = copy.closed(id, p.status);
  }
  if (row?.tg_message_id) await edit(d.tg, pot.chat_id, row.tg_message_id, card, p.status === "InProgress" ? voteKeyboard(d, pot, id) : [[{ text: "Ledger", url: ledgerUrl(d, daoId) }]]);

  if (!FINAL.has(p.status)) return p;
  if (!row) await saveProposal(d.db, { daoId, proposalId: id, chatId: pot.chat_id, tgMessageId: null, kind: kindName(p.kind), summary: p.description });
  if (!(await markAnnounced(d.db, daoId, id, p.status))) return p;

  const ledger: Kb = [[{ text: "Ledger", url: ledgerUrl(d, daoId) }, { text: "Explorer", url: accountUrl(d.cfg.explorer, daoId) }]];
  if ("Transfer" in p.kind) {
    const t = tokenOf(p.kind.Transfer.token_id);
    const meta = row?.summary?.startsWith("{") ? JSON.parse(row.summary) : null;
    const amount = meta?.asked ?? `${fromUnits(p.kind.Transfer.amount, t.decimals, 6)} ${t.symbol}`;
    const to = meta?.to ?? (await nameOf(d, p.kind.Transfer.receiver_id));
    const text = p.status === "Approved" ? copy.paid(amount, to, meta?.reason ?? "", approvers) : p.status === "Rejected" ? copy.rejected(id) : p.status === "Failed" ? copy.failed(id) : copy.closed(id, p.status);
    await send(d.tg, pot.chat_id, text, ledger);
  } else if ("AddMemberToRole" in p.kind) {
    const m = await memberByAccount(d.db, p.kind.AddMemberToRole.member_id);
    if (p.status === "Approved") {
      if (m) await setRole(d.db, m.chat_id, m.tg_user_id, "council");
      await send(d.tg, pot.chat_id, copy.memberIn(who(m), council.length, needed), ledger);
    } else {
      await send(d.tg, pot.chat_id, copy.memberOut(who(m)), ledger);
    }
  } else {
    await send(d.tg, pot.chat_id, copy.closed(id, p.status), ledger);
  }
  return p;
}
