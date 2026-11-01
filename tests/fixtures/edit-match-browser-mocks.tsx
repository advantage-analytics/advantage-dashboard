/**
 * Stand-ins for the Edit match dialog's browser harness
 * (`edit-match-harness.tsx`): the server actions, the server-only constant and
 * the two providers the dialog reads, none of which a plain webpack bundle can
 * hold. The dialog's own fetch of `/api/matches/[matchId]` stays real and is
 * answered by the spec's server.
 */

export const CRESTS_BUCKET = "crests";

export async function editMatchSuggestions() {
  return null;
}
export async function playerStyleFor() {
  return null;
}
export async function attachMatchToLine() {
  return { error: "not in this harness" };
}
export async function detachMatchFromLine() {
  return { error: "not in this harness" };
}
export async function setMatchRoundOnLine() {
  return { error: "not in this harness" };
}
export async function findAttachableLines() {
  return [];
}

export function forgetMatchDetails(): void {}

export function useToast() {
  return { push: () => {} };
}

export function useWorkspace() {
  return {
    active: { id: "personal", kind: "personal", role: "owner" },
    viewer: { id: "owner" },
  };
}

export function VerifiedFact(): null {
  return null;
}

export function useRouter() {
  return { refresh: () => {}, replace: () => {}, push: () => {} };
}
