/**
 * Shared identities for the edge-function auth-guard specs.
 *
 * `generate-insights`, `generate-key-moments` and `process-match` each write
 * under a service-role client while `verify_jwt` is satisfied by the public
 * anon key, so every one of them has to decide for itself who is calling —
 * the service role, the match's own uploader, or neither. The three guard
 * specs (`generate-insights-guards.spec.ts`, `generate-key-moments-guards.spec.ts`,
 * `process-match-guards.spec.ts`) exercise that decision against the same cast:
 * an owner, a stranger, and the match between them.
 */
export const OWNER = "11111111-1111-4111-8111-111111111111";
export const STRANGER = "22222222-2222-4222-8222-222222222222";
export const MATCH = "33333333-3333-4333-8333-333333333333";
export const ANON_KEY = "anon-key";
export const SERVICE_ROLE_KEY = "service-role-key";

/** Maps the bearer a test sends to the user id `auth.getUser` resolves it to. */
export const USER_TOKENS: Record<string, string> = {
  "owner-token": OWNER,
  "stranger-token": STRANGER,
};

/**
 * `generate-insights`'s stubbed `Deno.env`, keyed distinct per key so the
 * function's service-role check compares the bearer against the real key
 * rather than a value every key shares. The PostHog keys are left unset,
 * which keeps its capture (and its fetch) out of the run.
 *
 * Shared by `generate-insights-retry.spec.ts` and
 * `insights-workspace-history.spec.ts`.
 */
export const GENERATE_INSIGHTS_ENV: Record<string, string> = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  GEMINI_KEY: "gemini-key",
};
