import { describe, expect, it } from "vitest";
import { hasKey, pickJoinKey } from "../lib/client/join.ts";

describe("pickJoinKey", () => {
  it("reuses a key left from an earlier, unfinished join instead of making a new one", () => {
    expect(pickJoinKey("ed25519:kept", () => "ed25519:new")).toEqual({ secret: "ed25519:kept", reused: true });
  });
  it("makes a new key when there is none", () => {
    expect(pickJoinKey(null, () => "ed25519:new")).toEqual({ secret: "ed25519:new", reused: false });
  });
});

describe("hasKey", () => {
  it("is true when the chain lists this device's public key on the account", async () => {
    const calls: any[] = [];
    const ok = await hasKey(async (q) => (calls.push(q), { nonce: 1, permission: "FullAccess" }), "a.testnet", "ed25519:PUB");
    expect(ok).toBe(true);
    expect(calls[0]).toMatchObject({ request_type: "view_access_key", account_id: "a.testnet", public_key: "ed25519:PUB" });
  });
  it("is false when the account holds a different key", async () => {
    expect(await hasKey(async () => Promise.reject(new Error("access key ed25519:PUB does not exist while viewing")), "a.testnet", "ed25519:PUB")).toBe(false);
  });
  it("passes other errors on", async () => {
    await expect(hasKey(async () => Promise.reject(new Error("fetch failed")), "a.testnet", "ed25519:PUB")).rejects.toThrow("fetch failed");
  });
});

describe("waitFor", () => {
  it("waits for Telegram's script to appear instead of deciding too early", async () => {
    const { waitFor } = await import("../lib/client/join.ts");
    let calls = 0;
    const got = await waitFor(() => (++calls >= 3 ? { initData: "x" } : undefined), { timeoutMs: 500, intervalMs: 1 });
    expect(got).toEqual({ initData: "x" });
    expect(calls).toBe(3);
  });
  it("gives up after the timeout and returns undefined (a normal browser)", async () => {
    const { waitFor } = await import("../lib/client/join.ts");
    expect(await waitFor(() => undefined, { timeoutMs: 20, intervalMs: 5 })).toBeUndefined();
  });
});
