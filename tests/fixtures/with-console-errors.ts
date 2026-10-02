/**
 * Runs `run`, capturing every `console.error` call instead of letting it
 * print, and restores the original `console.error` afterwards even if `run`
 * throws.
 *
 * Shared by `tests/paged-query.spec.ts`, `tests/player-profile-serve-map.spec.ts`
 * and `tests/upload-route-guards.spec.ts` — each asserts on the exact
 * `console.error` calls a fail-closed read or a route's catch block makes,
 * without letting the expected-failure cases spam the test output.
 */
export async function withConsoleErrors<T>(
  run: () => Promise<T>,
): Promise<{ result: T; errors: unknown[][] }> {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    return { result: await run(), errors };
  } finally {
    console.error = original;
  }
}
