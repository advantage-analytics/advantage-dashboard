/**
 * The per-user limits on `/api/mcp` tool calls, and why there are two.
 *
 * A model on the other end of a connector can loop: a bad query retried
 * twenty ways in a few seconds, a "list every match, then query each" plan.
 * Nothing it can do reads data it may not see — the views and the pinned
 * viewer decide that — so what the limits protect is the database's time
 * and the question allowance:
 *
 *   - a sliding window in memory, per user, per server instance:
 *     `MCP_CALLS_PER_WINDOW` calls in `MCP_WINDOW_MS`. Cheap and immediate,
 *     and enough to stop a loop; but a Vercel function has as many
 *     instances as it has concurrency, each with its own window, so this is
 *     a soft limit by construction.
 *   - a hard cap per UTC day in the database: `MCP_DAILY_CALL_CAP`, counted
 *     by `ask_mcp_count_call()` into `ask_mcp_usage` (`usage.ts`). One row
 *     per user per day, incremented as the signed-in user, so every instance
 *     sees one count.
 *
 * The `ask` tool spends the monthly question allowance on top of both, as
 * the page does (`ask_reserve_question()`); these limits are about calls,
 * not questions.
 *
 * Pure: the clock is injectable and the state is the limiter's own.
 */

export const MCP_CALLS_PER_WINDOW = 60;
export const MCP_WINDOW_MS = 5 * 60_000;
export const MCP_DAILY_CALL_CAP = 500;

export type RateLimitDecision =
  { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

export interface RateLimiter {
  /** Record one call for `key` and say whether it was allowed. */
  check(key: string): RateLimitDecision;
}

export function createRateLimiter(
  options: {
    limit?: number;
    windowMs?: number;
    now?: () => number;
  } = {},
): RateLimiter {
  const limit = options.limit ?? MCP_CALLS_PER_WINDOW;
  const windowMs = options.windowMs ?? MCP_WINDOW_MS;
  const now = options.now ?? Date.now;
  /** Call times per key, oldest first, pruned on every check. */
  const calls = new Map<string, number[]>();

  return {
    check(key) {
      const at = now();
      const floor = at - windowMs;
      const kept = (calls.get(key) ?? []).filter((time) => time > floor);
      if (kept.length >= limit) {
        calls.set(key, kept);
        const oldest = kept[0];
        return {
          ok: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((oldest + windowMs - at) / 1000),
          ),
        };
      }
      kept.push(at);
      calls.set(key, kept);
      // Keys that fall silent are dropped so the map cannot grow without
      // bound across an instance's life.
      if (calls.size > 10_000) {
        for (const [other, times] of calls) {
          if (times.every((time) => time <= floor)) calls.delete(other);
        }
      }
      return { ok: true, remaining: limit - kept.length };
    },
  };
}

declare global {
  var __askMcpRateLimiter: RateLimiter | undefined;
}

/** One limiter per server instance (and across dev reloads), as the PostHog client is kept. */
export function sharedRateLimiter(): RateLimiter {
  globalThis.__askMcpRateLimiter ??= createRateLimiter();
  return globalThis.__askMcpRateLimiter;
}
