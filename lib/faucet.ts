// Fresh funded testnet accounts from NEAR's public faucet helper (the same service near-cli uses for
// "sponsor-by-faucet-service"). The private key is generated here and never leaves this process.
import { KeyPair } from "near-api-js";
import type { RpcChain, RpcSigner } from "./near/rpcChain.ts";

const HELPER = "https://helper.nearprotocol.com/account";

export async function createFaucetAccount(prefix: string, chain: RpcChain): Promise<{ signer: RpcSigner; privateKey: string; accountId: string }> {
  if (chain.network !== "testnet") throw new Error("the faucet only exists on testnet");
  const kp = KeyPair.fromRandom("ed25519");
  const accountId = `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.testnet`;
  const r = await fetch(HELPER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  if (!r.ok) throw new Error(`faucet refused ${accountId}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  for (let i = 0; i < 20 && !(await chain.accountExists(accountId)); i++) await new Promise((res) => setTimeout(res, 1000));
  const privateKey = kp.toString();
  return { signer: chain.signerFromKey(accountId, privateKey), privateKey, accountId };
}
