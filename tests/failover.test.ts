import { describe, expect, it } from "vitest";
import { failover } from "../lib/near/rpcChain.ts";

const fake = (impl: () => Promise<unknown>, calls: string[], name: string) => ({ query: async () => (calls.push(name), impl()) }) as any;

describe("failover", () => {
  it("moves to the next endpoint when one is rate limited", async () => {
    const calls: string[] = [];
    const p = failover([fake(() => Promise.reject(new Error("code -429 THIS ENDPOINT IS DEPRECATED")), calls, "a"), fake(() => Promise.resolve("ok"), calls, "b")]);
    expect(await (p as any).query()).toBe("ok");
    expect(calls).toEqual(["a", "b"]);
  });

  it("passes real answers through, such as an account that does not exist", async () => {
    const calls: string[] = [];
    const p = failover([fake(() => Promise.reject(new Error("account x.testnet does not exist while viewing")), calls, "a"), fake(() => Promise.resolve("ok"), calls, "b")]);
    await expect((p as any).query()).rejects.toThrow(/does not exist/);
    expect(calls).toEqual(["a"]);
  });
});
