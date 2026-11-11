"use client";
// "How it works" as it looks in Telegram: a group asks for money with /spend, a member approves in the Mini App with the
// key on their phone, and the contract pays. The messages use the bot's own wording (lib/bot/copy.ts) and the Mini App's
// vote screen (app/app/MiniApp.tsx). It plays while on screen, can be paused, and each step can be opened directly.
// With reduced motion it shows the final state and plays only on request.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui.tsx";

// Frames of the story and how long each one stays (ms).
const FRAMES = [
  { step: 0, ms: 900 }, // 0 empty chat
  { step: 0, ms: 1300 }, // 1 /spend message
  { step: 0, ms: 1900 }, // 2 payment card, 0 of 2
  { step: 1, ms: 1500 }, // 3 Mini App opens
  { step: 1, ms: 1700 }, // 4 approved on the phone
  { step: 1, ms: 1500 }, // 5 card shows 1 of 2
  { step: 2, ms: 1300 }, // 6 second approval, paid
  { step: 2, ms: 4200 }, // 7 "Paid" message
] as const;
const LAST = FRAMES.length - 1;
const FIRST_OF_STEP = [1, 3, 6];
const STEP_MS = [0, 1, 2].map((s) => FRAMES.filter((x) => x.step === s).reduce((n, x) => n + x.ms, 0));

const STEPS = [
  { title: "Ask in one line", body: "Anyone on the council types /spend. The bot files a Transfer proposal on the group's Sputnik DAO and posts a card." },
  { title: "Approve on your own phone", body: "Review and vote opens the Mini App. It shows what the contract will do and signs the vote with the key on that phone." },
  { title: "The contract pays", body: "At 2 of 3 approvals Sputnik pays out by itself. The bot only reports what the chain says." },
];

export default function ChatDemo() {
  const host = useRef<HTMLDivElement>(null);
  const [f, setF] = useState(LAST);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [still, setStill] = useState(false);
  const [run, setRun] = useState(0); // restarts the step's progress bar after a jump or a loop

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStill(reduce);
    if (!reduce) {
      setF(0);
      setPlaying(true);
    }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    if (host.current) io.observe(host.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    const t = setTimeout(() => {
      if (f === LAST && still) setPlaying(false);
      else {
        if (f === LAST) setRun((r) => r + 1);
        setF((x) => (x + 1) % FRAMES.length);
      }
    }, FRAMES[f].ms);
    return () => clearTimeout(t);
  }, [f, playing, visible, still]);

  const step = FRAMES[f].step;
  const approvals = f >= 6 ? 2 : f >= 4 ? 1 : 0;
  const paid = f >= 6;
  const sheet = f === 3 || f === 4;

  return (
    <div ref={host} className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(0,400px)] lg:gap-16">
      <div>
        <ol className="space-y-3">
          {STEPS.map((s, i) => {
            const on = step === i;
            return (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => {
                    setF(FIRST_OF_STEP[i]);
                    setRun((r) => r + 1);
                    setPlaying(!still);
                  }}
                  aria-current={on ? "step" : undefined}
                  className={`group relative w-full overflow-hidden rounded-3xl border p-5 text-left transition-colors duration-300 ${
                    on ? "border-primary/60 bg-primary/[0.06]" : "border-line bg-card hover:border-white/25"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span
                      className={`font-display grid size-10 shrink-0 place-items-center rounded-2xl text-lg font-semibold transition-colors duration-300 ${
                        on ? "bg-primary text-on-primary" : "bg-white/5 text-muted"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-lg font-semibold">{s.title}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-muted">{s.body}</span>
                    </span>
                  </div>
                  {on ? (
                    <span
                      key={`${i}-${run}`}
                      className="step-progress absolute bottom-0 left-0 h-0.5 bg-primary"
                      style={{ animationDuration: `${STEP_MS[i]}ms`, animationPlayState: playing && visible ? "running" : "paused" }}
                      aria-hidden
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex items-center gap-3 text-sm text-muted">
          <button
            type="button"
            onClick={() => {
              if (!playing && f === LAST) setF(0);
              setPlaying(!playing);
            }}
            aria-pressed={playing}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 font-medium text-fg transition-colors duration-200 hover:bg-white/5"
          >
            {playing ? <PauseIcon /> : <PlayIcon />} {playing ? "Pause" : f === LAST ? "Play the story" : "Play"}
          </button>
          <span>The messages use the bot&apos;s own wording.</span>
        </div>
      </div>

      <Phone>
        <ChatHeader />
        <div className="chat-bg relative flex min-h-[470px] flex-col justify-end gap-2.5 overflow-hidden px-3 pb-4 pt-3 text-[13px] leading-snug">
          <Bubble from="Commons" bot dim>
            <b>Treasury created</b>
            <br />
            Payments need 2 of 3 approvals. My role in this DAO is proposer only.
          </Bubble>
          {f >= 1 ? (
            <Bubble from="Linh" key="spend">
              <span className="font-mono text-[12px] text-sky-300">/spend</span> 25 NEAR @huc monitor for demo day
            </Bubble>
          ) : null}
          {f >= 2 ? (
            <Bubble from="Commons" bot key="card" buttons={paid ? ["Ledger"] : ["Review and vote", "Ledger"]} pressed={f === 3 ? 0 : undefined}>
              <b>Payment #4</b>
              <br />
              25 NEAR to @huc
              <br />
              <span className="font-mono text-[11.5px] text-sky-300">huc.commons.testnet</span>
              <br />
              For: monitor for demo day
              <br />
              Asked by @linh
              <br />
              <br />
              {paid ? (
                <span className="font-medium text-emerald-300">Status: paid</span>
              ) : (
                <span key={approvals} className="flash">
                  Approvals: {approvals} of 2{approvals ? " (@an)" : ""}
                </span>
              )}
            </Bubble>
          ) : null}
          {f >= 7 ? (
            <Bubble from="Commons" bot key="paid" buttons={["Ledger", "Explorer"]}>
              <b>Paid</b> 25 NEAR to @huc for monitor for demo day. Approved by @an and @linh.
            </Bubble>
          ) : null}

          {/* The Mini App, opened from "Review and vote". */}
          <div
            className={`absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-white/10 bg-[#141a24] p-4 shadow-[0_-20px_60px_-10px_rgb(0_0_0/0.8)] transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
              sheet ? "translate-y-0" : "translate-y-[105%]"
            }`}
            aria-hidden={!sheet}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Payment #4</span>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-200">Voting</span>
            </div>
            <div className="font-display mt-2 text-3xl font-semibold">25 NEAR</div>
            <div className="text-xs text-slate-300">
              to <span className="font-mono">huc.commons.testnet</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">Note from the proposer: monitor for demo day</p>
            <div className="mt-3 flex justify-between text-xs">
              <span>Approvals</span>
              <span className="tabular-nums">{f >= 4 ? 1 : 0} of 2</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-500" style={{ width: f >= 4 ? "50%" : "0%" }} />
            </div>
            {f >= 4 ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
                <Icon name="check" size={14} /> Your vote is on chain. Signed with the key on this phone.
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold">
                <span className="grid h-10 place-items-center rounded-xl bg-red-400/15 text-red-300">Reject</span>
                <span className="press grid h-10 place-items-center rounded-xl bg-emerald-400 text-slate-950">Approve</span>
              </div>
            )}
          </div>
        </div>
      </Phone>
    </div>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  // On narrow screens the phone comes first, so the story is visible while the steps are read below it.
  return (
    <div className="relative order-first mx-auto w-full max-w-[400px] lg:order-none">
      <div className="vault-glow pointer-events-none absolute -inset-10 opacity-60" aria-hidden />
      <div className="relative overflow-hidden rounded-[2.4rem] border border-white/12 bg-[#0b0f16] p-2 shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9)]">
        <div className="overflow-hidden rounded-[1.9rem] bg-[#0e1621]">{children}</div>
      </div>
    </div>
  );
}

function ChatHeader() {
  return (
    <div className="flex items-center gap-3 border-b border-white/5 bg-[#17212b] px-4 py-3">
      <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-xs font-bold text-slate-950">HT</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">Hackathon team</span>
        <span className="block text-xs text-slate-400">4 members, Commons bot</span>
      </span>
    </div>
  );
}

function Bubble({
  from,
  bot,
  dim,
  buttons,
  pressed,
  children,
}: {
  from: string;
  bot?: boolean;
  dim?: boolean;
  buttons?: string[];
  pressed?: number;
  children: React.ReactNode;
}) {
  return (
    <div className={`msg-in max-w-[88%] ${dim ? "opacity-45" : ""}`}>
      <div className="rounded-2xl rounded-bl-md bg-[#182533] px-3 py-2">
        <div className={`mb-0.5 flex items-center gap-1.5 text-[12px] font-semibold ${bot ? "text-amber-300" : "text-sky-300"}`}>
          {from}
          {bot ? <span className="rounded bg-amber-300/15 px-1 text-[10px] font-medium uppercase tracking-wide">bot</span> : null}
        </div>
        <div className="text-slate-100">{children}</div>
      </div>
      {buttons ? (
        <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${buttons.length}, minmax(0, 1fr))` }}>
          {buttons.map((b, i) => (
            <span
              key={b}
              className={`grid h-8 place-items-center rounded-xl text-[12px] font-medium transition-colors duration-200 ${
                pressed === i ? "bg-amber-400/40 text-white" : "bg-[#1f2c3a] text-slate-200"
              }`}
            >
              {b}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" />
  </svg>
);
const PauseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);
