// The real network. Every call here was first exercised by hand on testnet (see docs/demo-run.log).
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, getTransactionLastResult, teraToGas, type KeyPairString } from "near-api-js";
import { failover } from "./failover.ts";
import { DAO_DEPOSIT, MEMBER_FUNDING, type Chain, type Proposal, type ProposalKind, type Signer, type Vote } from "./chain.ts";
import type { Policy } from "./policy.ts";

export interface RpcSigner extends Signer {
  key: KeyPairString;
}

/** NEAR charges 10^19 yoctoNEAR per byte of storage; that part of a balance cannot be spent. */
const STORAGE_PRICE_PER_BYTE = 10n ** 19n;

type TxResult = { transaction: { hash: string } };

export { failover };

/** 100 Tgas is plenty for a vote that executes a transfer; NEAR reserves the prepaid amount at a pessimistic price. */
export const ACT_GAS = teraToGas("100");

export class RpcChain implements Chain {
  network: "testnet" | "mainnet";
  factory: string;
  provider: JsonRpcProvider;

  /** rpcUrl is tried first; a fallback is used only when an endpoint is rate limited or unreachable. */
  constructor(o: { network: "testnet" | "mainnet"; rpcUrl: string; factory: string; fallbackUrls?: string[] }) {
    this.network = o.network;
    this.factory = o.factory;
    const urls = [...new Set([o.rpcUrl, ...(o.fallbackUrls ?? [])])];
    this.provider = failover(urls.map((url) => new JsonRpcProvider({ url })));
  }

  signerFromKey(accountId: string, privateKey: string): RpcSigner {
    KeyPair.fromString(privateKey as KeyPairString); // fail fast on a malformed key
    return { accountId, key: privateKey as KeyPairString };
  }

  private account(s: Signer): Account {
    const key = (s as RpcSigner).key;
    if (!key) throw new Error(`no key for ${s.accountId}`);
    return new Account(s.accountId, this.provider, new KeyPairSigner(KeyPair.fromString(key)));
  }

  async view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
    const r: any = await this.provider.query({
      request_type: "call_function",
      finality: "optimistic",
      account_id: contractId,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    });
    return JSON.parse(Buffer.from(r.result).toString()) as T;
  }

  async createDao(sponsor: Signer, name: string, purpose: string, policy: Policy) {
    const args = Buffer.from(JSON.stringify({ config: { name, purpose, metadata: "" }, policy })).toString("base64");
    const r = (await this.account(sponsor).callFunctionRaw({
      contractId: this.factory,
      methodName: "create",
      args: { name, args },
      deposit: DAO_DEPOSIT,
      gas: teraToGas("150"),
    })) as unknown as TxResult;
    const daoId = `${name}.${this.factory}`;
    if (!(await this.accountExists(daoId))) throw new Error(`DAO ${daoId} was not created (tx ${r.transaction.hash})`);
    return { daoId, txHash: r.transaction.hash };
  }

  async createMemberAccount(sponsor: Signer, name: string, publicKey: string) {
    const accountId = `${name}.${sponsor.accountId}`;
    if (await this.accountExists(accountId)) throw new Error("ERR_ACCOUNT_EXISTS");
    const r = (await this.account(sponsor).createSubAccount({ accountOrPrefix: name, publicKey, nearToTransfer: MEMBER_FUNDING })) as unknown as TxResult;
    return { accountId, txHash: r.transaction.hash };
  }

  async addProposal(signer: Signer, daoId: string, description: string, kind: ProposalKind) {
    const policy = await this.getPolicy(daoId);
    const r = await this.account(signer).callFunctionRaw({
      contractId: daoId,
      methodName: "add_proposal",
      args: { proposal: { description, kind } },
      deposit: BigInt(policy.proposal_bond),
      gas: teraToGas("50"),
    });
    // add_proposal returns the new id; fall back to the counter if the result is not readable.
    let id = Number(getTransactionLastResult(r as any));
    if (!Number.isInteger(id)) id = (await this.view<number>(daoId, "get_last_proposal_id")) - 1;
    return { id, txHash: (r as unknown as TxResult).transaction.hash };
  }

  async act(signer: Signer, daoId: string, id: number, action: Vote, kind: ProposalKind) {
    const r = (await this.account(signer).callFunctionRaw({
      contractId: daoId,
      methodName: "act_proposal",
      args: { id, action, proposal: kind },
      gas: ACT_GAS,
    })) as unknown as TxResult;
    return { txHash: r.transaction.hash };
  }

  async transfer(signer: Signer, to: string, yocto: bigint) {
    const r = (await this.account(signer).signAndSendTransaction({ receiverId: to, actions: [actions.transfer(yocto)] })) as unknown as TxResult;
    return { txHash: r.transaction.hash };
  }

  getPolicy(daoId: string) {
    return this.view<Policy>(daoId, "get_policy");
  }

  async getProposal(daoId: string, id: number): Promise<Proposal | null> {
    try {
      return await this.view<Proposal>(daoId, "get_proposal", { id });
    } catch (e) {
      if (/ERR_NO_PROPOSAL/.test(String((e as Error).message))) return null;
      throw e;
    }
  }

  async getProposals(daoId: string): Promise<Proposal[]> {
    const last = await this.view<number>(daoId, "get_last_proposal_id");
    const out: Proposal[] = [];
    for (let from = 0; from < last; from += 100) out.push(...(await this.view<Proposal[]>(daoId, "get_proposals", { from_index: from, limit: 100 })));
    return out;
  }

  async balance(accountId: string) {
    const a: any = await this.provider.query({ request_type: "view_account", finality: "optimistic", account_id: accountId });
    const free = BigInt(a.amount) - BigInt(a.storage_usage) * STORAGE_PRICE_PER_BYTE;
    return free > 0n ? free : 0n;
  }

  async accountExists(accountId: string) {
    try {
      await this.provider.query({ request_type: "view_account", finality: "optimistic", account_id: accountId });
      return true;
    } catch (e) {
      if (/does not exist|UNKNOWN_ACCOUNT/i.test(String((e as Error).message))) return false;
      throw e;
    }
  }
}
