/**
 * Temporarily sets `process.env` vars for a test, restoring exactly what was
 * there before — a key that was unset comes back unset, not `""`.
 *
 * `NODE_ENV` is typed read-only on `process.env`; this goes through a loosely
 * typed alias so callers can still set and restore it like any other var.
 * `keys` names the vars a scenario cares about, so each call clears exactly
 * its own scope rather than every var either resolver might read.
 *
 * Shared by `tests/site-url.spec.ts` and `tests/request-origin.spec.ts` —
 * `siteUrl()` and `originFromHeaders()` both read `process.env` live on every
 * call, not at module load, so re-importing between tests buys nothing.
 */
export async function withEnv<K extends string, T>(
  keys: readonly K[],
  vars: Partial<Record<K, string | undefined>>,
  fn: () => Promise<T>,
): Promise<T> {
  const env = process.env as Record<string, string | undefined>;

  const original: Record<string, string | undefined> = {};
  for (const key of keys) {
    original[key] = env[key];
    delete env[key];
    const value = vars[key];
    if (value !== undefined) env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete env[key];
      else env[key] = original[key];
    }
  }
}
