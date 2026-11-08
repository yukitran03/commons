import { beforeEach, describe, expect, it } from "vitest";
import {
  addMember,
  ensurePot,
  markAnnounced,
  memberByTg,
  memberByUsername,
  members,
  openDb,
  potByChat,
  potByRef,
  proposalRow,
  saveProposal,
  setDao,
  setRole,
  type Db,
} from "../lib/db.ts";

let db: Db;
beforeEach(async () => {
  db = await openDb();
});

const member = (over: Partial<Parameters<typeof addMember>[1]> = {}) => ({
  chatId: -1001,
  tgUserId: 11,
  tgUsername: "Huc06",
  display: "Huc",
  accountId: "huc06.sponsor.testnet",
  publicKey: "ed25519:FakePublicKey111",
  role: "founder" as const,
  ...over,
});

describe("pots", () => {
  it("ensurePot is idempotent and gives a 10-char base32 ref", async () => {
    const a = await ensurePot(db, -1001, "Team", "testnet");
    const b = await ensurePot(db, -1001, "Team renamed", "testnet");
    expect(a.ref).toMatch(/^[a-z2-7]{10}$/);
    expect(b.ref).toBe(a.ref);
    expect((await potByRef(db, a.ref))?.chat_id).toBe(-1001);
  });

  it("setDao only sets the DAO once", async () => {
    await ensurePot(db, -1001, "Team", "testnet");
    expect(await setDao(db, -1001, "first.sputnikv2.testnet")).toBe(true);
    expect(await setDao(db, -1001, "second.sputnikv2.testnet")).toBe(false);
    expect((await potByChat(db, -1001))?.dao_id).toBe("first.sputnikv2.testnet");
  });
});

describe("members", () => {
  beforeEach(async () => {
    await ensurePot(db, -1001, "Team", "testnet");
  });

  it("addMember twice keeps one row", async () => {
    await addMember(db, member());
    await addMember(db, member());
    expect(await members(db, -1001)).toHaveLength(1);
  });

  it("finds a member by username without caring about case", async () => {
    await addMember(db, member());
    expect((await memberByUsername(db, -1001, "huc06"))?.account_id).toBe("huc06.sponsor.testnet");
    expect((await memberByUsername(db, -1001, "@HUC06"))?.account_id).toBe("huc06.sponsor.testnet");
    expect(await memberByUsername(db, -1001, "nobody")).toBeNull();
  });

  it("changes a member's role", async () => {
    await addMember(db, member({ role: "pending" }));
    await setRole(db, -1001, 11, "council");
    expect((await memberByTg(db, -1001, 11))?.role).toBe("council");
  });
});

describe("proposals", () => {
  it("saves a proposal and records the announced status", async () => {
    await saveProposal(db, { daoId: "d.sputnikv2.testnet", proposalId: 3, chatId: -1001, tgMessageId: 77, kind: "transfer", summary: "1 NEAR to @huc" });
    await markAnnounced(db, "d.sputnikv2.testnet", 3, "Approved");
    const row = await proposalRow(db, "d.sputnikv2.testnet", 3);
    expect(row).toMatchObject({ tg_message_id: 77, announced_status: "Approved", summary: "1 NEAR to @huc" });
    expect(await proposalRow(db, "d.sputnikv2.testnet", 4)).toBeNull();
  });
});
