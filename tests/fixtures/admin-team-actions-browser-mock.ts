import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";

/**
 * Every server action on Admin › Teams, stood in for in the browser bundles
 * `tests/pilot-usage-card.spec.ts` and `tests/admin-team-writes.spec.ts` drive.
 * A server action cannot be bundled, so these answer `{ ok: true }` — or, once
 * a spec has set `window.__actionFailure`, reject the way the real call does:
 * each `failures` entry carries the shape Next's client hands back.
 */
const failures = {
  /** `fetch` rejecting — Safari's words for a dropped connection. */
  dropped: () => new TypeError("Load failed"),
  /** The response dying part-way through, in a dev build's words. */
  closedInDev: () => new Error("Connection closed."),
  /** The same, as a production build of React says it. */
  closed: () =>
    new Error(
      "Minified React error #412; visit https://react.dev/errors/412 for the full message",
    ),
  /** A throw inside the action: Flight rebuilds it with a digest. */
  server: () =>
    Object.assign(
      new Error(
        "Minified React error #441; visit https://react.dev/errors/441 for the full message",
      ),
      { digest: "1234567890" },
    ),
  /** A 500 or 504 from in front of the app, with no Flight body at all. */
  unexpected: () =>
    new Error("An unexpected response was received from the server."),
  /** A deploy retired the action this tab still holds. */
  stale: () => new UnrecognizedActionError("Server Action was not found."),
  redirect: () =>
    Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;push;/login;307;",
    }),
  notFound: () =>
    Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    }),
};

export type ActionFailure = keyof typeof failures;

declare global {
  interface Window {
    __actionFailure?: ActionFailure;
  }
}

type Outcome =
  { ok: true; id: string; profileId: string } | { ok: false; error: string };

export async function answer(): Promise<Outcome> {
  await new Promise((done) => setTimeout(done, 20));
  const failure = window.__actionFailure;
  if (failure) throw failures[failure]();
  return { ok: true, id: "conference", profileId: "profile" };
}

export const adminSetPilotEnd = answer;
export const adminEndPilot = answer;
export const adminSetPilotEligible = answer;
export const adminUpdateProgramDetails = answer;
export const adminRemoveProgramCrest = answer;
export const adminUploadProgramCrest = answer;
export const adminInviteMember = answer;
export const adminRevokeInvite = answer;
export const adminSetMemberUploadEnabled = answer;
export const adminSetProgramMemberRole = answer;
export const adminTransferProgramOwnership = answer;
export const adminResolveJoinRequest = answer;
export const adminAddProgramPlayer = answer;
export const conferenceIdForLabel = answer;
export const addTeamToConference = answer;

// The Settings defaults the shared controls fall back to. Nothing here calls
// them, since the console always passes its own, but the import has to resolve.
export const setProgramMemberRole = answer;
export const transferProgramOwnership = answer;
export const uploadProgramCrest = answer;
export const removeProgramCrest = answer;
export const addSelfAsPlayer = answer;

// The rest of /admin, for `tests/admin-writes.spec.ts`.
export const saveConference = answer;
export const deleteConference = answer;
export const mergeConferences = answer;
export const createConference = answer;
export const adminUploadConferenceCrest = answer;
export const adminRemoveConferenceCrest = answer;
export const approveClaim = answer;
export const rejectClaim = answer;
export const handBackClaim = answer;
export const reopenClaim = answer;
export const sendClaimVerification = answer;
export const saveClaimNote = answer;
export const resolveRequest = answer;
export const seedLabelSessionAction = answer;
export const createProgram = answer;
export const markAdminRowSeen = async () => {};
export const conferenceOptionsFor = async () => [];
export const adminSearchTeams = async () => [];

export async function loadConferenceTeams() {
  const outcome = await answer();
  return outcome.ok ? { ok: true as const, teams: [] } : outcome;
}

export async function loadMoreAdminTeams() {
  await answer();
  return { rows: [], nextCursor: null };
}
