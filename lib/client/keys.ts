// Browser-side key storage. Telegram SecureStorage (iOS Keychain / Android Keystore, Bot API 9.0+) when the client
// supports it, otherwise this browser's localStorage. Keys are never sent to the server or to Telegram's cloud.

type Cb<T> = (err: unknown, value?: T) => void;
interface SecureStorage {
  setItem(key: string, value: string, cb?: Cb<boolean>): void;
  getItem(key: string, cb: Cb<string | null>): void;
}

const tgSecure = (): SecureStorage | null => {
  const w = typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;
  return w?.SecureStorage && w.isVersionAtLeast?.("9.0") ? (w.SecureStorage as SecureStorage) : null;
};

const slot = (accountId: string) => `commons_key_${accountId.replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 128);

export type KeyPlace = "telegram-secure-storage" | "browser";

export async function saveKey(accountId: string, secret: string): Promise<KeyPlace> {
  const s = tgSecure();
  if (s) {
    const ok = await new Promise<boolean>((resolve) => s.setItem(slot(accountId), secret, (err) => resolve(!err)));
    if (ok) return "telegram-secure-storage";
  }
  localStorage.setItem(slot(accountId), secret);
  return "browser";
}

export async function loadKey(accountId: string): Promise<string | null> {
  const s = tgSecure();
  if (s) {
    const v = await new Promise<string | null>((resolve) => s.getItem(slot(accountId), (err, value) => resolve(err ? null : (value ?? null))));
    if (v) return v;
  }
  return localStorage.getItem(slot(accountId));
}
