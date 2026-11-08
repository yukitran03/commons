"use client";
// The Telegram Mini App. Keys are generated and kept on this device; votes and chip-ins are signed here and sent
// straight to NEAR. The server only ever receives public keys and "please re-read proposal N" requests.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, teraToGas, type KeyPairString } from "near-api-js";
import { Badge, Card, Icon, Mono, Stat, statusLabel, statusTone } from "@/components/ui.tsx";
import { loadKey, saveKey, type KeyPlace } from "@/lib/client/keys.ts";
import { parsePayload, type Payload } from "@/lib/telegram.ts";
import { fromUnits, toUnits } from "@/lib/tokens.ts";
import { SOURCES } from "@/lib/intents.ts";
import type { Proposal } from "@/lib/near/chain.ts";

type PotInfo = {
  ref: string;
  title: string;
  daoId: string | null;
  network: "testnet" | "mainnet";
  rpcUrl: string;
  explorer: string;
  rules: { council: string[]; needed: number; holdsYocto: string } | null;
  me: { accountId: string; role: "founder" | "pending" | "council" } | null;
  signedIn: boolean;
  demo: boolean;
};

type Auth = { initData?: string; demoUser?: { id: number; username?: string; first_name?: string } };

const tgApp = (): any => (typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null);
const near = (yocto: string | bigint) => `${fromUnits(yocto, 24)} NEAR`;
const haptic = (kind: "success" | "error") => tgApp()?.HapticFeedback?.notificationOccurred?.(kind);

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j as T;
}

async function viewCall<T>(rpcUrl: string, contractId: string, method: string, args: object): Promise<T> {
  const provider = new JsonRpcProvider({ url: rpcUrl });
  const r: any = await provider.query({
    request_type: "call_function",
    finality: "optimistic",
    account_id: contractId,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result))) as T;
}

function account(info: PotInfo, accountId: string, secret: string) {
  return new Account(accountId, new JsonRpcProvider({ url: info.rpcUrl }), new KeyPairSigner(KeyPair.fromString(secret as KeyPairString)));
}

function Button({ children, onClick, busy, tone = "primary", disabled }: { children: React.ReactNode; onClick: () => void; busy?: boolean; tone?: "primary" | "ok" | "bad" | "ghost"; disabled?: boolean }) {
  const tones = {
    primary: "bg-primary text-on-primary",
    ok: "bg-ok text-white",
    bad: "bg-bad text-white",
    ghost: "border border-line bg-transparent text-fg",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      aria-busy={busy}
      className={`inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 font-medium transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {busy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
}

function Notice({ tone, children }: { tone: "ok" | "bad" | "info"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "bg-ok-soft text-ok" : tone === "bad" ? "bg-bad-soft text-bad" : "bg-card text-muted";
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`rounded-xl px-3 py-2.5 text-sm ${cls}`}>
      {children}
    </div>
  );
}

function TxLink({ info, hash }: { info: PotInfo; hash: string }) {
  return (
    <a href={`${info.explorer}/txns/${hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
      View transaction <Icon name="external" size={14} />
    </a>
  );
}

export default function MiniApp() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [auth, setAuth] = useState<Auth>({});
  const [info, setInfo] = useState<PotInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inTelegram, setInTelegram] = useState(false);

  useEffect(() => {
    const app = tgApp();
    const start = app?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get("p") || "";
    if (app?.initData) {
      setInTelegram(true);
      app.ready();
      app.expand?.();
      setAuth({ initData: app.initData });
    }
    const p = parsePayload(start);
    if (!p) setError("This link is not a Commons link. Open it from the group's message.");
    setPayload(p);
  }, []);

  const refresh = useCallback(async () => {
    if (!payload) return;
    try {
      setInfo(await post<PotInfo>("/api/pot", { ref: payload.ref, ...auth }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [payload, auth]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <main className={`${inTelegram ? "tg" : ""} min-h-dvh bg-bg px-4 pb-10 pt-4 text-fg`}>
      <div className="mx-auto max-w-md space-y-4">
        <header className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-on-primary">
            <Icon name="shield" size={20} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold">{info?.title ?? "Commons"}</div>
            <div className="truncate text-xs text-muted">{info?.daoId ? <Mono>{info.daoId}</Mono> : "Group treasury on NEAR"}</div>
          </div>
          {info ? (
            <span className="ml-auto">
              <Badge>{info.network}</Badge>
            </span>
          ) : null}
        </header>

        {error ? <Notice tone="bad">{error}</Notice> : null}
        {!error && !info ? <div className="h-40 animate-pulse rounded-2xl bg-card" aria-label="Loading" /> : null}

        {info && !inTelegram && !auth.demoUser ? <DemoIdentity demo={info.demo} onPick={(u) => setAuth({ demoUser: u })} /> : null}

        {info && payload?.mode === "join" ? <Join info={info} auth={auth} onDone={refresh} /> : null}
        {info && payload?.mode === "vote" ? <Vote info={info} auth={auth} id={payload.id} /> : null}
        {info && payload?.mode === "chip" ? <ChipIn info={info} /> : null}

        {info?.daoId ? (
          <a href={`/c/${info.daoId}`} className="flex min-h-11 items-center justify-center gap-1 text-sm text-link">
            Public ledger <Icon name="external" size={14} />
          </a>
        ) : null}
      </div>
    </main>
  );
}

function DemoIdentity({ demo, onPick }: { demo: boolean; onPick: (u: { id: number; username: string; first_name: string }) => void }) {
  const [name, setName] = useState("");
  if (!demo) return <Notice tone="info">Open this page from the Telegram group to join or vote.</Notice>;
  const id = Math.abs([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) + 1000;
  return (
    <Card>
      <label htmlFor="demo-name" className="text-sm font-medium">
        Demo mode: who are you?
      </label>
      <p className="mt-1 text-xs text-muted">Outside Telegram on testnet, pick a name to act as. Inside Telegram your identity comes from Telegram.</p>
      <input
        id="demo-name"
        value={name}
        onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20))}
        className="mt-3 min-h-11 w-full rounded-xl border border-line bg-bg px-3"
        placeholder="alice"
        autoComplete="off"
      />
      <div className="mt-3">
        <Button disabled={name.length < 2} onClick={() => onPick({ id, username: name.toLowerCase(), first_name: name })}>
          Continue as {name || "..."}
        </Button>
      </div>
    </Card>
  );
}

function KeyBackup({ accountId }: { accountId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <details className="rounded-xl border border-line p-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
        <Icon name="key" size={16} /> Back up your key
      </summary>
      <p className="mt-2 text-muted">Anyone with this key controls your vote and the NEAR in your account. Keep it somewhere private. If you lose it, the council can vote to replace you.</p>
      {secret ? (
        <div className="mt-3 space-y-2">
          <code className="block break-all rounded-lg bg-card p-2 font-mono text-xs">{secret}</code>
          <Button
            tone="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(secret);
              setCopied(true);
            }}
          >
            <Icon name="copy" size={16} /> {copied ? "Copied" : "Copy key"}
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <Button tone="ghost" onClick={async () => setSecret((await loadKey(accountId)) ?? "This device does not hold the key for this account.")}>
            Show key
          </Button>
        </div>
      )}
    </details>
  );
}

function Join({ info, auth, onDone }: { info: PotInfo; auth: Auth; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ accountId: string; role: string; txHash: string; place: KeyPlace } | null>(null);
  const ready = !!(auth.initData || auth.demoUser);

  const join = async () => {
    setBusy(true);
    setErr(null);
    try {
      const kp = KeyPair.fromRandom("ed25519");
      const secret = kp.toString();
      await saveKey(`pending-${info.ref}`, secret); // kept even if the page closes before the server answers
      const r = await post<{ accountId: string; role: string; txHash: string; existing?: boolean }>("/api/join", { ref: info.ref, publicKey: kp.getPublicKey().toString(), ...auth });
      const place = r.existing ? "browser" : await saveKey(r.accountId, secret);
      setDone({ ...r, place });
      haptic("success");
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      haptic("error");
    } finally {
      setBusy(false);
    }
  };

  if (info.me) {
    return (
      <Card className="space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <Icon name="check" className="text-ok" /> You are in
        </div>
        <Stat label="Your NEAR account" value={<Mono>{info.me.accountId}</Mono>} hint={roleText(info.me.role)} />
        {done?.txHash ? (
          <p className="text-sm text-muted">
            Key stored {done.place === "telegram-secure-storage" ? "in Telegram's secure storage on this phone" : "in this browser"}. <TxLink info={info} hash={done.txHash} />
          </p>
        ) : null}
        <KeyBackup accountId={info.me.accountId} />
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Join {info.title}</h1>
        <p className="mt-1 text-sm text-muted">You get your own NEAR account. Its key is created on this device and never leaves it. Commons pays the account's first fees.</p>
      </div>
      <ul className="space-y-2 text-sm">
        <li className="flex gap-2">
          <Icon name="key" className="mt-0.5 shrink-0 text-muted" /> Your key, your vote. Nobody else can sign for you.
        </li>
        <li className="flex gap-2">
          <Icon name="users" className="mt-0.5 shrink-0 text-muted" />
          {info.daoId ? "The council votes to add you, like any other decision." : "Join before the treasury is created and you are a founding council member."}
        </li>
      </ul>
      {err ? <Notice tone="bad">{err}</Notice> : null}
      <Button busy={busy} disabled={!ready} onClick={join}>
        {busy ? "Creating your account" : "Create my account"}
      </Button>
    </Card>
  );
}

const roleText = (r: string) => (r === "council" ? "Council member: you vote on payments" : r === "founder" ? "Founder: you join the council when the treasury is created" : "Waiting for the council to vote you in");

function Vote({ info, auth, id }: { info: PotInfo; auth: Auth; id: number }) {
  const [p, setP] = useState<Proposal | null | undefined>(undefined);
  const [busy, setBusy] = useState<"VoteApprove" | "VoteReject" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!info.daoId) return setP(null);
    try {
      setP(await viewCall<Proposal>(info.rpcUrl, info.daoId, "get_proposal", { id }));
    } catch {
      setP(null);
    }
  }, [info, id]);

  useEffect(() => {
    load();
  }, [load]);

  const vote = async (action: "VoteApprove" | "VoteReject") => {
    if (!info.me || !p || !info.daoId) return;
    setBusy(action);
    setErr(null);
    try {
      const secret = (await loadKey(info.me.accountId)) ?? (await loadKey(`pending-${info.ref}`));
      if (!secret) throw new Error(`This device does not hold the key for ${info.me.accountId}. Vote from the phone you joined with.`);
      const r: any = await account(info, info.me.accountId, secret).callFunctionRaw({
        contractId: info.daoId,
        methodName: "act_proposal",
        args: { id, action, proposal: p.kind },
        gas: teraToGas("150"),
      });
      setTx(r.transaction.hash);
      haptic("success");
      await post("/api/vote", { ref: info.ref, id, ...auth }).catch(() => null);
      await load();
    } catch (e) {
      const m = (e as Error).message;
      setErr(/ERR_ALREADY_VOTED/.test(m) ? "You already voted on this." : /ERR_PERMISSION_DENIED/.test(m) ? "Only council members can vote." : m);
      haptic("error");
    } finally {
      setBusy(null);
    }
  };

  if (p === undefined) return <div className="h-48 animate-pulse rounded-2xl bg-card" aria-label="Loading proposal" />;
  if (p === null) return <Notice tone="bad">Proposal #{id} was not found on this treasury.</Notice>;

  const council = info.rules?.council ?? [];
  const approvals = Object.entries(p.votes).filter(([a, v]) => v === "Approve" && council.includes(a));
  const rejections = Object.entries(p.votes).filter(([a, v]) => v === "Reject" && council.includes(a));
  const needed = info.rules?.needed ?? 1;
  const isTransfer = "Transfer" in p.kind;
  const mine = info.me ? p.votes[info.me.accountId] : undefined;
  const canVote = info.me?.role === "council" && p.status === "InProgress" && !mine;

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-muted">{isTransfer ? "Payment" : "New member"} #{p.id}</div>
        <Badge tone={statusTone(p.status)}>{statusLabel(p.status, isTransfer)}</Badge>
      </div>
      {"Transfer" in p.kind ? (
        <div>
          <div className="text-3xl font-semibold tabular-nums">{p.kind.Transfer.token_id === "" ? near(p.kind.Transfer.amount) : `${fromUnits(p.kind.Transfer.amount, 6)} USDC`}</div>
          <div className="mt-1 text-sm">
            to <Mono>{p.kind.Transfer.receiver_id}</Mono>
          </div>
        </div>
      ) : "AddMemberToRole" in p.kind ? (
        <div className="text-lg font-semibold">
          Add <Mono>{p.kind.AddMemberToRole.member_id}</Mono> to the {p.kind.AddMemberToRole.role}
        </div>
      ) : null}
      <p className="text-sm text-muted">{p.description}</p>

      <div>
        <div className="flex justify-between text-sm">
          <span>Approvals</span>
          <span className="tabular-nums">
            {approvals.length} of {needed}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuemin={0} aria-valuemax={needed} aria-valuenow={approvals.length}>
          <div className="h-full rounded-full bg-ok transition-[width] duration-300" style={{ width: `${Math.min(100, (approvals.length / needed) * 100)}%` }} />
        </div>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {[...approvals, ...rejections].map(([a, v]) => (
            <li key={a} className="flex items-center gap-1">
              <Icon name={v === "Approve" ? "check" : "x"} size={12} className={v === "Approve" ? "text-ok" : "text-bad"} /> <Mono>{a}</Mono>
            </li>
          ))}
        </ul>
      </div>

      {err ? <Notice tone="bad">{err}</Notice> : null}
      {tx ? (
        <Notice tone="ok">
          Your vote is on chain. <TxLink info={info} hash={tx} />
        </Notice>
      ) : null}
      {mine ? <Notice tone="info">You voted {mine === "Approve" ? "to approve" : "to reject"}.</Notice> : null}
      {!info.me && p.status === "InProgress" ? <Notice tone="info">Only council members can vote. Join the pot first.</Notice> : null}
      {info.me && info.me.role !== "council" && p.status === "InProgress" ? <Notice tone="info">{roleText(info.me.role)}.</Notice> : null}

      {canVote ? (
        <div className="grid grid-cols-2 gap-3">
          <Button tone="bad" busy={busy === "VoteReject"} disabled={!!busy} onClick={() => vote("VoteReject")}>
            <Icon name="x" size={16} /> Reject
          </Button>
          <Button tone="ok" busy={busy === "VoteApprove"} disabled={!!busy} onClick={() => vote("VoteApprove")}>
            <Icon name="check" size={16} /> Approve
          </Button>
        </div>
      ) : null}
      {canVote ? <p className="text-center text-xs text-muted">Signed on this device with your own key. The bot cannot vote.</p> : null}
    </Card>
  );
}

function ChipIn({ info }: { info: PotInfo }) {
  const [tab, setTab] = useState<"near" | "chain">("near");
  return (
    <Card className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Chip in</h1>
        <p className="mt-1 text-sm text-muted">{info.rules ? `The pot holds ${near(info.rules.holdsYocto)}.` : "The treasury has not been created yet."}</p>
      </div>
      <div role="tablist" className="grid grid-cols-2 rounded-xl bg-bg p-1 text-sm">
        {(
          [
            ["near", "From my NEAR account"],
            ["chain", "From another chain"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-11 cursor-pointer rounded-lg px-2 font-medium transition-colors duration-200 ${tab === k ? "bg-card text-fg shadow-sm" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "near" ? <FromNear info={info} /> : <FromChain info={info} />}
    </Card>
  );
}

function FromNear({ info }: { info: PotInfo }) {
  const [amount, setAmount] = useState("0.1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  const valid = useMemo(() => {
    try {
      return toUnits(amount, 24) > 0n;
    } catch {
      return false;
    }
  }, [amount]);

  if (!info.me) return <Notice tone="info">Join the pot first. Your NEAR account is created when you join.</Notice>;
  if (!info.daoId) return <Notice tone="info">The treasury does not exist yet.</Notice>;

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const secret = await loadKey(info.me!.accountId);
      if (!secret) throw new Error(`This device does not hold the key for ${info.me!.accountId}.`);
      const r: any = await account(info, info.me!.accountId, secret).signAndSendTransaction({ receiverId: info.daoId!, actions: [actions.transfer(toUnits(amount, 24))] });
      setTx(r.transaction.hash);
      haptic("success");
    } catch (e) {
      setErr(/NotEnoughBalance|LackBalance/i.test((e as Error).message) ? "Your account does not hold that much NEAR." : (e as Error).message);
      haptic("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label htmlFor="amt" className="block text-sm font-medium">
        Amount in NEAR
      </label>
      <input
        id="amt"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(",", "."))}
        aria-invalid={!valid}
        className="min-h-12 w-full rounded-xl border border-line bg-bg px-3 font-mono text-lg tabular-nums"
      />
      <p className="text-xs text-muted">
        From <Mono>{info.me.accountId}</Mono> to <Mono>{info.daoId}</Mono>
      </p>
      {err ? <Notice tone="bad">{err}</Notice> : null}
      {tx ? (
        <Notice tone="ok">
          Sent. <TxLink info={info} hash={tx} />
        </Notice>
      ) : null}
      <Button busy={busy} disabled={!valid} onClick={send}>
        <Icon name="wallet" size={16} /> Send {valid ? amount : ""} NEAR
      </Button>
    </div>
  );
}

function FromChain({ info }: { info: PotInfo }) {
  const [source, setSource] = useState<string>(SOURCES[0].id);
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState<null | { ok: boolean; reason?: string; amountOut?: string; minAmountOut?: string; timeEstimateSec?: number; dry?: boolean }>(null);

  if (!info.daoId) return <Notice tone="info">The treasury does not exist yet.</Notice>;

  const quote = async () => {
    setBusy(true);
    setQ(null);
    try {
      setQ(await post("/api/quote", { ref: info.ref, sourceId: source, amount }));
    } catch (e) {
      setQ({ ok: false, reason: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label htmlFor="src" className="block text-sm font-medium">
        Pay with
      </label>
      <select id="src" value={source} onChange={(e) => setSource(e.target.value)} className="min-h-12 w-full rounded-xl border border-line bg-bg px-3">
        {SOURCES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <label htmlFor="amt2" className="block text-sm font-medium">
        Amount
      </label>
      <input id="amt2" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} className="min-h-12 w-full rounded-xl border border-line bg-bg px-3 font-mono text-lg" />
      <Button busy={busy} onClick={quote}>
        <Icon name="globe" size={16} /> Get a live quote
      </Button>
      {q && q.ok ? (
        <Notice tone="ok">
          The pot would receive about <b>{fromUnits(q.amountOut!, 6, 2)} USDC</b>
          {q.minAmountOut ? ` (at least ${fromUnits(q.minAmountOut, 6, 2)})` : ""}
          {q.timeEstimateSec ? ` in about ${q.timeEstimateSec} seconds` : ""}, routed by NEAR Intents.
        </Notice>
      ) : null}
      {q && !q.ok ? <Notice tone="bad">No quote right now: {q.reason}</Notice> : null}
      <p className="text-xs text-muted">
        {info.network === "testnet"
          ? "Live price. Cross-chain chip-ins settle on NEAR mainnet, so this testnet pot shows quotes only and never hands out a deposit address."
          : "Quotes come from the NEAR Intents 1Click API."}
      </p>
    </div>
  );
}
