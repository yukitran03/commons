// Human-readable NEAR names. Member accounts are "<name>.<sponsor>", DAOs are "<name>.<factory>".

const ascii = (s: string) =>
  s
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const tidy = (s: string) => s.replace(/[-_]{2,}/g, (m) => m[0]).replace(/^[-_]+|[-_]+$/g, "");

/**
 * A valid NEAR account prefix (2 to maxLen chars, default 32) from a Telegram user. Without a username, adds the id's
 * last 4 digits. Callers pass a smaller maxLen so that "<name>.<sponsor>" stays within NEAR's 64-character limit.
 */
export function accountName(u: { username?: string; first_name?: string; id: number }, maxLen = 32): string {
  const suffix = String(Math.abs(u.id) % 10_000).padStart(4, "0");
  if (u.username) {
    const base = tidy(ascii(u.username).replace(/[^a-z0-9_-]/g, "")).slice(0, maxLen);
    const name = tidy(base);
    if (name.length >= 2) return name;
    if (name.length === 1) return `${name}-${suffix}`;
  }
  const first = tidy(ascii(u.first_name ?? "").replace(/[^a-z0-9_-]/g, "")).slice(0, Math.max(1, maxLen - 5));
  return `${tidy(first) || "member"}-${suffix}`;
}

/** A Sputnik DAO name from the chat title: lowercase words joined by "-", plus 6 chars of the seed. Max 40 chars. */
export function daoName(title: string, seed: string): string {
  const slug = ascii(title).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 33).replace(/-+$/, "");
  const tail = seed.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  return `${slug || "commons"}-${tail}`;
}
