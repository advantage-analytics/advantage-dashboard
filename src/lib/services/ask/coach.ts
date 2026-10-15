import type { AskScope } from "@/lib/services/ask/scope";
import type { ProgramRole } from "@/lib/workspace/types";

/**
 * Coach mode (roadmap 4.3): behind a flag, off by default, and a product
 * decision that has not been taken — the flag is how the decision is kept
 * open without keeping the code out.
 *
 * When `ASK_COACH_MODE` is on AND the question is a team question AND the
 * viewer's role in that program is owner or coach, the answer prompt may
 * recommend what to work on. Every recommendation is tied to a cited figure
 * cell — the renderer still substitutes every number and the model still
 * never types one — and the advice path yields a `coach` notice instead of
 * `no_advice` (`events.ts`). A player on the roster, a personal question, or
 * the flag off: nothing changes.
 *
 * The three conditions are decided once, in the route, from the server's own
 * workspace read (`getWorkspaceContext()`): never from the request body.
 * `askCoachMode()` is the pure decision; `isAskCoachModeEnabled()` reads the
 * flag. A leaf: imports types only, so a spec and a client file can read it.
 */

export const ASK_COACH_MODE_ENV = "ASK_COACH_MODE";

/** The program roles coach mode is open to. */
export const ASK_COACH_ROLES: readonly ProgramRole[] = ["owner", "coach"];

/**
 * The sentence a client may show beside a `coach` notice. Like the
 * no-advice sentence it is the server's and appears in no prompt.
 */
export const ASK_COACH_SENTENCE =
  "Coach mode: what to work on is drawn from the cited figures of the program's matches.";

/** True for `1`, `true` or `on`, in any case; anything else — unset included — is off. */
export function isAskCoachModeEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = (env[ASK_COACH_MODE_ENV] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

/**
 * Whether this question runs in coach mode: the flag, a team scope and a
 * staff role that may coach, all three. `role` is the viewer's role in the
 * program the scope names, as the workspace read gives it; null or absent
 * is a member whose role is unknown, and is treated as a player.
 */
export function askCoachMode(input: {
  enabled: boolean;
  scope: AskScope;
  role: ProgramRole | null | undefined;
}): boolean {
  if (!input.enabled || input.scope.kind !== "team") return false;
  return input.role != null && ASK_COACH_ROLES.includes(input.role);
}
