import { describe, expect, it } from "vitest";
import { NEAR_USDC, SOURCES, chipInStatus, quoteChipIn } from "../lib/intents.ts";

type Captured = { url: string; init: RequestInit };
function fakeFetch(respond: (c: Captured) => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const f = (async (url: any, init: any) => {
    const c = { url: String(url), init };
    calls.push(c);
    return respond(c);
  }) as typeof fetch;
  return { f, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("quoteChipIn", () => {
  it("asks 1Click for a dry EXACT_INPUT quote into NEAR USDC for the pot", async () => {
    const { f, calls } = fakeFetch(() => json({ quote: { amountIn: "5000000", amountOut: "4985000", minAmountOut: "4935150", timeEstimate: 20 } }));
    const r = await quoteChipIn({ sourceId: "base-usdc", amount: "5", recipient: "team.sputnikv2.testnet", refundTo: "0x000000000000000000000000000000000000dEaD", dry: true, fetchImpl: f });
    expect(r).toMatchObject({ ok: true, amountIn: "5000000", amountOut: "4985000", minAmountOut: "4935150", timeEstimateSec: 20 });
    expect(calls[0].url).toBe("https://1click.chaindefuser.com/v0/quote");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      dry: true,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: SOURCES.find((s) => s.id === "base-usdc")!.assetId,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: NEAR_USDC,
      amount: "5000000",
      recipient: "team.sputnikv2.testnet",
      recipientType: "DESTINATION_CHAIN",
      refundType: "ORIGIN_CHAIN",
    });
    expect(Date.parse(body.deadline)).toBeGreaterThan(Date.now());
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("sends the JWT as a bearer token when there is one", async () => {
    const { f, calls } = fakeFetch(() => json({ quote: { amountIn: "1", amountOut: "1" } }));
    await quoteChipIn({ sourceId: "base-usdc", amount: "1", recipient: "x.near", refundTo: "0x0", dry: true, jwt: "jwt-fake", fetchImpl: f });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-fake");
  });

  it("returns the API message when 1Click answers with an error", async () => {
    const { f } = fakeFetch(() => json({ message: "Failed to receive response within timeout of 25000ms" }, 500));
    const r = await quoteChipIn({ sourceId: "base-usdc", amount: "5", recipient: "x.near", refundTo: "0x0", dry: true, fetchImpl: f });
    expect(r).toEqual({ ok: false, reason: "Failed to receive response within timeout of 25000ms" });
  });

  it("says the quote timed out when 1Click does not answer in time", async () => {
    const { f } = fakeFetch(
      (c) =>
        new Promise<Response>((_, reject) => {
          c.init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const r = await quoteChipIn({ sourceId: "base-usdc", amount: "5", recipient: "x.near", refundTo: "0x0", dry: true, fetchImpl: f, timeoutMs: 20 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/timed out/);
  });

  it("refuses an unknown source and a bad amount without calling the API", async () => {
    const { f, calls } = fakeFetch(() => json({}));
    expect(await quoteChipIn({ sourceId: "doge", amount: "5", recipient: "x.near", refundTo: "0x0", dry: true, fetchImpl: f })).toMatchObject({ ok: false });
    expect(await quoteChipIn({ sourceId: "base-usdc", amount: "0", recipient: "x.near", refundTo: "0x0", dry: true, fetchImpl: f })).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });
});

describe("chipInStatus", () => {
  it("reads the swap status for a deposit address", async () => {
    const { f, calls } = fakeFetch(() => json({ status: "SUCCESS" }));
    expect(await chipInStatus("0xabc", f)).toMatchObject({ status: "SUCCESS" });
    expect(calls[0].url).toBe("https://1click.chaindefuser.com/v0/status?depositAddress=0xabc");
  });

  it("returns null when the status cannot be read", async () => {
    const { f } = fakeFetch(() => json({ message: "not found" }, 404));
    expect(await chipInStatus("0xabc", f)).toBeNull();
  });
});
