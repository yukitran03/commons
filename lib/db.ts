// Postgres for the Telegram side only: which chat owns which DAO, which Telegram user owns which NEAR account, and
// which message shows which proposal. Money, votes and policy are always read from the chain.
// Neon serverless in production (DATABASE_URL), in-memory PGlite for tests and the offline demo.

export type Row = Record<string, any>;
export interface Db {
  q<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export type Role = "founder" | "pending" | "council";

export interface PotRow {
  chat_id: number;
  ref: string;
  title: string;
  dao_id: string | null;
  network: string;
}

export interface MemberRow {
  chat_id: number;
  tg_user_id: number;
  tg_username: string | null;
  display: string;
  account_id: string;
  public_key: string;
  role: Role;
}

export interface ProposalRow {
  dao_id: string;
  proposal_id: number;
  chat_id: number;
  tg_message_id: number | null;
  kind: string;
  summary: string;
  announced_status: string | null;
}

const SCHEMA = [
  `create table if not exists pots (
    chat_id bigint primary key,
    ref text not null unique,
    title text not null,
    dao_id text unique,
    network text not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists members (
    chat_id bigint not null,
    tg_user_id bigint not null,
    tg_username text,
    display text not null,
    account_id text not null unique,
    public_key text not null,
    role text not null check (role in ('founder','pending','council')),
    joined_at timestamptz not null default now(),
    primary key (chat_id, tg_user_id)
  )`,
  `create table if not exists proposals (
    dao_id text not null,
    proposal_id int not null,
    chat_id bigint not null,
    tg_message_id bigint,
    kind text not null,
    summary text not null,
    announced_status text,
    primary key (dao_id, proposal_id)
  )`,
];

export async function openDb(url?: string): Promise<Db> {
  let exec: (sql: string, params: unknown[]) => Promise<Row[]>;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    exec = async (text, params) => (await sql.query(text, params as any[])) as Row[];
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite();
    await pg.waitReady;
    exec = async (text, params) => (await pg.query(text, params as any[])).rows as Row[];
  }
  for (const s of SCHEMA) await exec(s, []);
  return { q: async <T extends Row = Row>(text: string, params: unknown[] = []) => (await exec(text, params)) as T[] };
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const pot = (r: Row | undefined): PotRow | null => (r ? { chat_id: Number(r.chat_id), ref: r.ref, title: r.title, dao_id: r.dao_id ?? null, network: r.network } : null);
const mem = (r: Row | undefined): MemberRow | null =>
  r
    ? {
        chat_id: Number(r.chat_id),
        tg_user_id: Number(r.tg_user_id),
        tg_username: r.tg_username ?? null,
        display: r.display,
        account_id: r.account_id,
        public_key: r.public_key,
        role: r.role,
      }
    : null;

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
export function newRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => BASE32[b % 32]).join("");
}

export async function ensurePot(db: Db, chatId: number, title: string, network: string): Promise<PotRow> {
  const rows = await db.q(
    `insert into pots (chat_id, ref, title, network) values ($1, $2, $3, $4)
     on conflict (chat_id) do update set title = excluded.title
     returning *`,
    [chatId, newRef(), title, network],
  );
  return pot(rows[0])!;
}

export async function potByRef(db: Db, ref: string) {
  return pot((await db.q(`select * from pots where ref = $1`, [ref]))[0]);
}

export async function potByChat(db: Db, chatId: number) {
  return pot((await db.q(`select * from pots where chat_id = $1`, [chatId]))[0]);
}

export async function potByDao(db: Db, daoId: string) {
  return pot((await db.q(`select * from pots where dao_id = $1`, [daoId]))[0]);
}

/** Sets the pot's DAO only if it has none. Returns false when a DAO was already recorded. */
export async function setDao(db: Db, chatId: number, daoId: string): Promise<boolean> {
  const rows = await db.q(`update pots set dao_id = $2 where chat_id = $1 and dao_id is null returning chat_id`, [chatId, daoId]);
  return rows.length > 0;
}

export async function addMember(
  db: Db,
  m: { chatId: number; tgUserId: number; tgUsername: string | null | undefined; display: string; accountId: string; publicKey: string; role: Role },
): Promise<void> {
  await db.q(
    `insert into members (chat_id, tg_user_id, tg_username, display, account_id, public_key, role)
     values ($1, $2, $3, $4, $5, $6, $7) on conflict (chat_id, tg_user_id) do nothing`,
    [m.chatId, m.tgUserId, m.tgUsername ?? null, m.display, m.accountId, m.publicKey, m.role],
  );
}

export async function memberByTg(db: Db, chatId: number, tgUserId: number) {
  return mem((await db.q(`select * from members where chat_id = $1 and tg_user_id = $2`, [chatId, tgUserId]))[0]);
}

export async function memberByUsername(db: Db, chatId: number, username: string) {
  const u = username.replace(/^@/, "");
  return mem((await db.q(`select * from members where chat_id = $1 and lower(tg_username) = lower($2)`, [chatId, u]))[0]);
}

export async function memberByAccount(db: Db, accountId: string) {
  return mem((await db.q(`select * from members where account_id = $1`, [accountId]))[0]);
}

export async function members(db: Db, chatId: number): Promise<MemberRow[]> {
  return (await db.q(`select * from members where chat_id = $1 order by joined_at, tg_user_id`, [chatId])).map((r) => mem(r)!);
}

export async function setRole(db: Db, chatId: number, tgUserId: number, role: Role) {
  await db.q(`update members set role = $3 where chat_id = $1 and tg_user_id = $2`, [chatId, tgUserId, role]);
}

export async function saveProposal(
  db: Db,
  p: { daoId: string; proposalId: number; chatId: number; tgMessageId: number | null; kind: string; summary: string },
) {
  await db.q(
    `insert into proposals (dao_id, proposal_id, chat_id, tg_message_id, kind, summary) values ($1, $2, $3, $4, $5, $6)
     on conflict (dao_id, proposal_id) do update set tg_message_id = excluded.tg_message_id, summary = excluded.summary`,
    [p.daoId, p.proposalId, p.chatId, p.tgMessageId, p.kind, p.summary],
  );
}

export async function proposalRow(db: Db, daoId: string, id: number): Promise<ProposalRow | null> {
  const r = (await db.q(`select * from proposals where dao_id = $1 and proposal_id = $2`, [daoId, id]))[0];
  return r
    ? { dao_id: r.dao_id, proposal_id: Number(r.proposal_id), chat_id: Number(r.chat_id), tg_message_id: num(r.tg_message_id), kind: r.kind, summary: r.summary, announced_status: r.announced_status ?? null }
    : null;
}

/** Records that a final status was announced. Returns false if it had already been announced (so it is said once). */
export async function markAnnounced(db: Db, daoId: string, id: number, status: string): Promise<boolean> {
  const rows = await db.q(
    `update proposals set announced_status = $3 where dao_id = $1 and proposal_id = $2 and announced_status is distinct from $3 returning proposal_id`,
    [daoId, id, status],
  );
  return rows.length > 0;
}
