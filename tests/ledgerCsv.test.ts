import { describe, expect, it } from "vitest";
import { csvCell, ledgerCsv } from "../lib/ledgerCsv.ts";
import type { Proposal } from "../lib/near/chain.ts";

const base = { proposer: "bot.sponsor.testnet", vote_counts: {}, submission_time: "1762790400000000000" } as const;
const near = (n: string) => (BigInt(n) * 10n ** 23n).toString(); // tenths of a NEAR in yocto

describe("ledgerCsv", () => {
  it("writes one row per proposal with what the contract did, oldest first", () => {
    const rows: Proposal[] = [
      {
        ...base,
        id: 0,
        description: "monitor for demo day",
        kind: { Transfer: { token_id: "", receiver_id: "huc.sponsor.testnet", amount: near("1") } },
        status: "Approved",
        votes: { "alice.sponsor.testnet": "Approve", "bob.sponsor.testnet": "Approve", "carol.sponsor.testnet": "Reject" },
      },
      { ...base, id: 1, description: "add dan", kind: { AddMemberToRole: { member_id: "dan.sponsor.testnet", role: "council" } }, status: "InProgress", votes: {} },
    ];
    const lines = ledgerCsv(rows).trimEnd().split("\r\n");
    expect(lines[0]).toBe("id,submitted_utc,kind,amount,token,to,status,approvals,rejections,approved_by,proposer,description");
    expect(lines[1]).toBe(
      "0,2025-11-10 16:00,Payment,0.1,NEAR,huc.sponsor.testnet,Approved,2,1,alice.sponsor.testnet bob.sponsor.testnet,bot.sponsor.testnet,monitor for demo day",
    );
    expect(lines[2]).toBe("1,2025-11-10 16:00,New member,,,dan.sponsor.testnet,InProgress,0,0,,bot.sponsor.testnet,add dan");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell('a, "b"\nc')).toBe('"a, ""b""\nc"');
    expect(csvCell("plain")).toBe("plain");
  });

  it("defuses spreadsheet formulas in free text", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@sum")).toBe("'@sum");
  });
});
