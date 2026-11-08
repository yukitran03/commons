import { describe, expect, it } from "vitest";
import { nearConfig, rpcUrls } from "../lib/near/config.ts";

describe("nearConfig", () => {
  it("defaults to FastNEAR testnet RPC, since rpc.testnet.near.org is deprecated and rate limited", () => {
    expect(nearConfig({}).rpcUrl).toBe("https://test.rpc.fastnear.com");
    expect(nearConfig({ NEAR_NETWORK: "mainnet" }).rpcUrl).toBe("https://free.rpc.fastnear.com");
  });
  it("keeps the old public endpoint only as a fallback after the configured one", () => {
    expect(rpcUrls(nearConfig({}))).toEqual(["https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"]);
    expect(rpcUrls(nearConfig({ NEAR_RPC_URL: "https://rpc.example" }))).toEqual(["https://rpc.example", "https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"]);
  });
});

describe(".env.example", () => {
  it("does not point anyone at the deprecated rpc.*.near.org endpoints", async () => {
    const { readFileSync } = await import("node:fs");
    const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    expect(env).not.toMatch(/^NEAR_RPC_URL=https:\/\/rpc\.(testnet|mainnet)\.near\.org/m);
  });
});
