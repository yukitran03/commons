# Notes for coding agents

## Commands

- `npm ci` installs exact versions from the lockfile (Node 22.6 or newer).
- `npm test` runs the vitest suite. Offline, no keys.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run demo` runs the full story against an in-memory model of Sputnik DAO. Offline, no keys. Exit code 0 means every step passed.
- `npm run verify -- <dao>` checks a live DAO over NEAR RPC (read-only, no keys). Without an argument it uses the DAO named in `docs/demo-run.log`.
- `npm run demo:testnet` repeats the story on NEAR testnet with fresh accounts (network; uses the public faucet once).
- `npm run build` builds the Next.js app.

## Layout

- `lib/near/` chain access: `policy.ts` (Sputnik roles and thresholds), `chain.ts` (interface), `rpcChain.ts` (testnet), `fakeChain.ts` (in-memory model used by tests and the offline demo).
- `lib/pot.ts` joining, creating the treasury, drafting payments, reporting results. `lib/bot/` Telegram commands and copy.
- `lib/intents.ts` NEAR Intents 1Click quotes. `lib/tgauth.ts` Mini App initData verification. `lib/db.ts` Postgres (Neon) or PGlite.
- `app/` Next.js: `api/telegram` webhook, `api/join|vote|pot|quote` Mini App endpoints, `app/` the Mini App, `c/[dao]` the public ledger.
- `scripts/` demo, testnet demo, verify, setup and webhook scripts. `tests/` vitest.

## Rules

- Never commit keys. `.env.example` holds placeholders only; test fixtures use obviously fake values.
- Member private keys must never be sent to the server.
- Use near-api-js 7.x. Do not use near-sdk-js, wallet-selector or Shade Agents (deprecated).
