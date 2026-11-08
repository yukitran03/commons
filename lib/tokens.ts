// Tokens a pot can hold and exact decimal conversion (no floating point anywhere near money).

export type TokenSymbol = "NEAR" | "USDC";

export const TOKENS: Record<TokenSymbol, { decimals: number; tokenId: { testnet: string | null; mainnet: string } }> = {
  // Sputnik uses "" for native NEAR transfers.
  NEAR: { decimals: 24, tokenId: { testnet: "", mainnet: "" } },
  // Native USDC on NEAR. There is no official USDC on testnet, so testnet pots hold NEAR only.
  USDC: { decimals: 6, tokenId: { testnet: null, mainnet: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1" } },
};

/** "1.5" with 24 decimals -> 1500000000000000000000000n. Throws Error("amount") unless it is a positive plain decimal. */
export function toUnits(amount: string, decimals: number): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!m) throw new Error("amount");
  const frac = m[2] ?? "";
  if (frac.length > decimals) throw new Error("amount");
  const units = BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  if (units <= 0n) throw new Error("amount");
  return units;
}

/** 1500000000000000000000000n with 24 decimals -> "1.5". Truncates (never rounds up) to maxFrac digits. */
export function fromUnits(units: bigint | string, decimals: number, maxFrac = 4): string {
  const v = BigInt(units);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const int = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}
