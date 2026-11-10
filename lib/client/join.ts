// Pure helpers for the Mini App's join flow, kept apart from React so they can be tested.

/**
 * Reuse a key saved by an earlier join that never finished (page closed, slow server). Making a fresh key every time
 * would overwrite the only copy of the key the new account was actually created with.
 */
export function pickJoinKey(pending: string | null, generate: () => string): { secret: string; reused: boolean } {
  return pending ? { secret: pending, reused: true } : { secret: generate(), reused: false };
}

/**
 * Polls until get() returns something, or gives up. Used to wait for telegram-web-app.js, which can finish loading
 * after React's first effect; deciding too early would treat a real Telegram user as an outside browser.
 */
export async function waitFor<T>(get: () => T | undefined | null, o: { timeoutMs?: number; intervalMs?: number } = {}): Promise<T | undefined> {
  const end = Date.now() + (o.timeoutMs ?? 3000);
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() >= end) return undefined;
    await new Promise((r) => setTimeout(r, o.intervalMs ?? 50));
  }
}

/**
 * Does the account really hold this device's public key? Checked on chain after joining, so neither a buggy nor a
 * dishonest server can hand a member an account whose key it chose itself.
 */
export async function hasKey(query: (q: Record<string, unknown>) => Promise<unknown>, accountId: string, publicKey: string): Promise<boolean> {
  try {
    await query({ request_type: "view_access_key", finality: "optimistic", account_id: accountId, public_key: publicKey });
    return true;
  } catch (e) {
    if (/does not exist|UNKNOWN_ACCESS_KEY|access key/i.test(String((e as Error)?.message ?? e))) return false;
    throw e;
  }
}
