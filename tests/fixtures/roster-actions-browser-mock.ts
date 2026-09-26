/**
 * `addProgramPlayer` for browser harnesses. Refuses by default, so a fixture
 * that never meant to create anyone cannot. A spec sets
 * `window.__addProgramPlayer` to `{ profileId }` for a success, or to
 * `{ error }` for a refusal; every call is recorded in
 * `window.__addProgramPlayerCalls`.
 */
type MockAddResult = { profileId: string | null } | { error: string };

declare global {
  interface Window {
    __addProgramPlayer?: MockAddResult;
    __addProgramPlayerCalls?: { firstName: string; lastName: string }[];
  }
}

export async function addProgramPlayer(input: {
  firstName: string;
  lastName: string;
}) {
  const scope = typeof window === "undefined" ? undefined : window;
  if (scope) {
    scope.__addProgramPlayerCalls = [
      ...(scope.__addProgramPlayerCalls ?? []),
      { firstName: input.firstName, lastName: input.lastName },
    ];
  }
  const outcome = scope?.__addProgramPlayer;
  if (outcome && "profileId" in outcome) {
    return { ok: true as const, profileId: outcome.profileId };
  }
  return {
    ok: false as const,
    error:
      outcome && "error" in outcome
        ? outcome.error
        : "Not used in this fixture.",
  };
}
