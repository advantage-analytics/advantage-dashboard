/**
 * The wizard's half of "may this person record a match here, and for whom".
 *
 * `uploadEligibility()` (`lib/workspace/upload-eligibility.ts`) is the
 * decision; this file is how the wizard puts its own state in front of it and
 * reads the answer back. Everything here is pure — no React, no Supabase — so
 * `useUploadMatchWizard` can call it from a memo and a handler, and
 * `tests/upload-eligibility.spec.ts` can call it from a fixture table without a
 * browser. That split is what lets the attribution rule be tested at all:
 * the hook is 2,000 lines of effects, and the one line that decides
 * `matches.player1_id` used to be buried in its submit handler.
 *
 * The rule this file exists to keep: a team match is attributed to a roster
 * player the uploader CHOSE, or to nobody — never to the uploader's login as a
 * fallback. `player1_id` is half the `matches` SELECT policy, so a coach's id
 * on an athlete's row hands the coach read access the athlete then loses, with
 * nothing on screen looking wrong. Every function below either produces a
 * choice, checks one, or resolves one; none of them substitutes a viewer id
 * where a choice is missing.
 */

import {
  rosterPlayerOptions,
  type RosterFullRow,
  type RosterPlayerOption,
} from "@/lib/data/roster-shared";
import type { Workspace } from "@/lib/workspace/types";
import {
  uploadEligibility,
  type AthleteChoice,
  type ProgramApprovalReading,
  type RosterIdentity,
  type UploadEligibility,
} from "@/lib/workspace/upload-eligibility";
import type { EventPreset, Step } from "./types";

/**
 * WHOSE match a team upload records.
 *
 * `roster` writes the picked profile's id — a `program_players.id`, the id
 * `matches_block_client_regraft` checks against the roster. `self` is the
 * uploader's own login: the only athlete a personal workspace has, and NOT an
 * athlete in a team one, where `uploadEligibility()` refuses it as
 * `athlete-required`. It stays in the union because the personal wizard is
 * the same hook; it is never offered by the team picker and
 * `chooseMatchSubject` refuses to install it there.
 */
export type MatchSubject =
  { kind: "self" } | { kind: "roster"; playerId: string; name: string };

/**
 * The half of `MatchSubject` a link can name.
 *
 * "Myself" needs no shortcut — it is the uploader, and the wizard's own
 * default in the only workspace where it is not asked — so a seed is always a
 * roster athlete. Narrowing it here rather than accepting the whole union
 * keeps the impossible variant out of every seeding path.
 */
export type RosterSubject = Extract<MatchSubject, { kind: "roster" }>;

/**
 * The viewer's own live profile on the active program, as a direct read of
 * `program_players` returns it.
 *
 * Needed because `program_roster_full`'s player arm drops a profile claimed
 * by STAFF (`pm.role is null or pm.role = 'player'`), and `Workspace.myPlayerId`
 * is null for staff too — so an owner or coach who genuinely plays for the
 * program would never see their own profile in the picker, and the only row
 * left for them would be the uploader fallback this file forbids. The read
 * mirrors `claimedProfilesByProgram()` in `active-workspace-server.ts`: live
 * (not archived, not merged), bound to this login, this program.
 */
export interface OwnProfileRow {
  id: string;
  program_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  class_year: string | null;
  lineup_spot: number | null;
  claimed_by_user_id: string | null;
}

/**
 * The picker's list: the RPC's player rows plus the viewer's own profile when
 * the RPC left it out, through the shared filter/name/sort pipeline so the
 * added row is shaped exactly like the others.
 *
 * The own row is added only when it names THIS program, is bound to THIS
 * viewer, and is not already in the list — a player's claimed profile arrives
 * through arm 1 and must not appear twice. It is offered on equal terms: the
 * same `roster` choice, resolved by the same `uploadEligibility()` call, which
 * passes it because it is on the roster and not because of who owns the
 * program.
 */
export function eligibleRosterOptions(
  rows: readonly RosterFullRow[] | null | undefined,
  own: OwnProfileRow | null | undefined,
  programId: string,
  viewerId: string,
): RosterPlayerOption[] {
  const base = rows ? [...rows] : [];
  if (
    own &&
    own.program_id === programId &&
    own.claimed_by_user_id === viewerId &&
    !base.some((row) => row.player_id === own.id)
  ) {
    base.push({
      player_id: own.id,
      user_id: own.claimed_by_user_id,
      display_name: `${own.first_name} ${own.last_name}`.trim(),
      email: own.email,
      role: "player",
      lineup_spot: own.lineup_spot,
      class_year: own.class_year,
      managed_by: "self",
    });
  }
  return rosterPlayerOptions(base);
}

/**
 * The athlete the wizard is holding, in the contract's terms.
 *
 * - A preset names its player, or names nobody (`playerUserId: null`) —
 *   which is a real answer from the event, not a gap to fill.
 * - A team workspace holds whatever was chosen, including nothing. `self` is
 *   passed through as-is so the contract can refuse it; it is not rewritten.
 * - A personal workspace is the uploader's own by definition, unless a roster
 *   choice is still lying around from a team workspace the person left — that
 *   is passed through too, and refused as `athlete-not-personal`, rather than
 *   quietly overwritten.
 */
export function wizardAthleteChoice(input: {
  workspace: Pick<Workspace, "kind">;
  preset?: EventPreset | null;
  subject: MatchSubject | null;
}): AthleteChoice | null {
  const { workspace, preset, subject } = input;
  if (preset) {
    return preset.playerUserId
      ? { kind: "roster", playerId: preset.playerUserId }
      : null;
  }
  if (workspace.kind === "team") return subject;
  return subject ?? { kind: "self" };
}

/**
 * The wizard's reading of the decision: either the value to write to
 * `matches.player1_id`, or the contract's own refusal, untouched.
 *
 * `attribution` is the resolved id — the roster profile's, or the viewer's
 * own in a personal workspace — or `null` for the one case the contract does
 * not cover: a DOUBLES line, whose preset names no single player and whose
 * `supportsVideo: false` is how the event says so. Two athletes stand on our
 * side of that line and `player1_id` names neither; that is what the wizard
 * wrote before this file and what the regraft trigger accepts. A SINGLES line
 * with nobody assigned is not the same thing: it is refused as
 * `athlete-required`, because the fix is assigning the line on the event,
 * which owns that fact, not filing the match under nobody.
 */
export type WizardEligibility =
  | { ok: true; attribution: string | null }
  | Extract<UploadEligibility, { ok: false }>;

export interface WizardEligibilityInput {
  workspace: Workspace;
  viewerId: string;
  preset?: EventPreset | null;
  subject: MatchSubject | null;
  /**
   * The eligible roster (`eligibleRosterOptions()`), `null` when the load
   * failed, `undefined` while it is still in flight. Both refuse; neither is
   * a pass. Never read for a personal workspace.
   */
  roster: readonly RosterIdentity[] | null | undefined;
  /** True when the write would set `event_entry_id` on a NEW row. */
  attachesToLine?: boolean;
  /** A fresher `programs.status`, when the caller re-read it (T13). */
  approval?: ProgramApprovalReading;
}

export function wizardUploadEligibility(
  input: WizardEligibilityInput,
): WizardEligibility {
  const { workspace, viewerId, preset, subject, roster } = input;
  const athlete = wizardAthleteChoice({ workspace, preset, subject });
  const result = uploadEligibility({
    workspace,
    viewerId,
    athlete,
    roster,
    attachesToLine: input.attachesToLine,
    approval: input.approval,
  });

  if (result.ok) {
    return {
      ok: true,
      attribution:
        result.athlete.kind === "self"
          ? result.athlete.userId
          : result.athlete.playerId,
    };
  }

  // The doubles carve-out, and only that. Every other refusal — including a
  // singles line with no player assigned — stands exactly as decided.
  if (
    result.reason === "athlete-required" &&
    preset &&
    preset.playerUserId === null &&
    !preset.supportsVideo
  ) {
    return { ok: true, attribution: null };
  }

  return result;
}

/**
 * The subject, if the loaded roster still has it; else null.
 *
 * A roster that has not loaded (`null`) decides nothing, so the subject is
 * returned as-is and checked again when it does. Once it has, a subject that
 * names nobody on it — a `?player=` link for someone archived since, a row
 * merged into another while the wizard sat open, a pick that outlived a
 * workspace switch — comes back null, which the hook reads as "return to
 * selection". It never comes back as the uploader. `self` in a team picker
 * is not on any roster and clears the same way.
 */
export function rosterSubjectOrNull(
  subject: MatchSubject | null,
  roster: readonly RosterIdentity[] | null | undefined,
): MatchSubject | null {
  if (!subject || !roster) return subject;
  if (subject.kind !== "roster") return null;
  return roster.some(
    (row) =>
      row.playerId === subject.playerId || row.userId === subject.playerId,
  )
    ? subject
    : null;
}

/**
 * The identity an import is compared against, and keyed on.
 *
 * Feeds `evaluateImportedIdentityMatch()` and, through it, the confirmation
 * key from `buildImportIdentityConfirmationKey()` — so a change of subject
 * changes the key, and a confirmation given for one athlete cannot carry to
 * another. In a team workspace with nothing chosen the id is NULL and the
 * name empty: the uploader's login is not the fallback here either, or a
 * coach's confirmation of "player 1 is me" would survive their picking the
 * athlete afterwards.
 */
export function identityAthleteFor(input: {
  workspace: Pick<Workspace, "kind">;
  viewer: { id: string; name: string };
  preset?: EventPreset | null;
  subject: MatchSubject | null;
}): { id: string | null; name: string } {
  const { workspace, viewer, preset, subject } = input;
  if (preset) return { id: preset.playerUserId, name: preset.playerName };
  if (workspace.kind === "team") {
    return subject?.kind === "roster"
      ? { id: subject.playerId, name: subject.name }
      : { id: null, name: "" };
  }
  return { id: viewer.id, name: viewer.name };
}

/**
 * Where a resumed draft (no preset) lands, given whether this wizard asks
 * who played.
 *
 * The file never survives a draft, so a personal draft resumes on the file
 * step. A draft that has to ask who played — a team workspace — resumes on
 * the provider step: the who-played answer is not persisted (durable draft
 * persistence is deliberately out of scope), so the subject is missing, and
 * a flow that opened past the step that asks it would either create a match
 * for nobody or fall back to the uploader. The draft itself stays whole — the
 * provider, the form and any attached line are all seeded; only the step
 * returns to selection.
 */
export function draftResumeStep(asksWhoPlayed: boolean): Step {
  return asksWhoPlayed ? "provider" : "file";
}

/**
 * The workspace a draft may be resumed into: its own, and only its own.
 *
 * `match_drafts.program_id` records the workspace the draft was saved under
 * (`saveMatchDraft`), and RLS on that table scopes rows by `user_id` alone —
 * so a draft reads back to its author whatever workspace is active now, and
 * whether or not they are still a member of the program it was saved in. This
 * is the comparison nothing used to make.
 *
 * A personal workspace is `program_id IS NULL`, so both sides normalise to
 * "the program id, or null", and a personal draft resumed while a team is
 * active is a mismatch exactly as a team draft in a personal workspace is.
 */
export function draftBelongsToWorkspace(
  draftProgramId: string | null,
  workspace: Pick<Workspace, "kind" | "id">,
): boolean {
  return draftProgramId === (workspace.kind === "team" ? workspace.id : null);
}

/**
 * Why a draft was not resumed, in the words the wizard shows.
 *
 * The refusal is deliberate and not a switch: resuming must never re-home a
 * draft into whatever workspace happens to be active, because `program_id` is
 * what the row will be billed and scoped by, and a URL is not consent to
 * change the workspace every other surface is showing. Nor can a switch always
 * be offered — the draft's program may be one the author has since left. So
 * the wizard starts clean and says whose draft it was, leaving the switch to
 * the switcher.
 *
 * `savedIn` is null when the draft's workspace is not one the viewer holds any
 * more; the sentence then names no program rather than inventing one.
 */
export function draftWorkspaceRefusal(savedIn: string | null): string {
  return savedIn
    ? `That draft was saved in ${savedIn}, so it wasn't resumed here. Switch to ${savedIn} to pick it up — this match will be saved in the workspace you're in now.`
    : "That draft was saved in another workspace, so it wasn't resumed here. Switch to the workspace it belongs to to pick it up — this match will be saved in the workspace you're in now.";
}
