// Several RPC endpoints behind one provider, usable on the server and in the browser.
import { JsonRpcProvider } from "near-api-js";

const TRANSIENT = /429|rate.?limit|too many requests|deprecated|ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|failed to fetch|socket hang up|\b50[234]\b/i;

/**
 * Wraps several providers as one. Unlike near-api-js FailoverRpcProvider, it moves to the next endpoint only on
 * transport trouble (rate limits, outages), never on answers like "account does not exist", which callers rely on.
 */
export function failover(providers: JsonRpcProvider[]): JsonRpcProvider {
  if (providers.length === 1) return providers[0];
  return new Proxy(providers[0], {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        let last: unknown;
        for (const p of providers) {
          try {
            return await (p as any)[prop](...args);
          } catch (e) {
            last = e;
            if (!TRANSIENT.test(String((e as Error)?.message ?? e))) throw e;
          }
        }
        throw last;
      };
    },
  });
}

export const providerFor = (urls: string[]) => failover([...new Set(urls)].map((url) => new JsonRpcProvider({ url })));
