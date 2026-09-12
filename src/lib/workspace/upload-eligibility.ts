/**
 * May this person record a match here — and for whom?
 *
 * NOT YET WIRED IN. This module is the contract only; as of T11 nothing
 * outside `tests/upload-eligibility.spec.ts` calls it, and no upload path is
 * gated by it. It is built to become one reasoned answer for every seam that
 * files a match — the wizard before it lets someone continue (T12), the
 * wizard again before it writes (T13), and the two video routes before a
 * credential is minted or a job is spent (T14-T16). Each of those will ask
 * with whatever it has in hand and get back either the attribution to write
 * or one named reason it must not. Until those tasks land, attribution is
 * still enforced solely by the `matches_block_client_regraft` trigger and
 * RLS; read the paragraphs below as the design those tasks implement, not as
 * a description of what runs today.
 *
 * PROVIDER-INDEPENDENT, and that is the point of its existence. The video
 * seams already have `explainVideoRefusal()` and `reserveQuota()`, which
 * answer "may this workspace's allowance be spent" — but a SwingVision import
 * spends no allowance and asked nobody, so a program still waiting on its
 * claim could take an import it must not take. The rule here is about
 * recording a match at all, so it never reads `canSubmitVideo` and never
 * mentions minutes. The two layers are meant to stack: once wired, the video
 * seams will ask this first and then their own question, in that order.
 *
 * Pure. No I/O, no clock, no Supabase — the caller resolves the workspace, the
 * roster and any fresher approval reading, and this decides. That is what
 * lets it be a table of fixtures in `tests/upload-eligibility.spec.ts` rather
 * than a database test, and what lets a route handler and a client hook share
 * it without either importing the other's world.
 *
 * ── The five questions, in the order they are asked ────────────────────────
 *
 * 1. WORKSPACE — is there one? `billingWorkspaceFor()` answers `undefined`
 *    for a program the viewer is not in; that is a refusal, not a gap.
 * 2. APPROVAL — `programs.status`, reused from the claim machine rather than
 *    recomputed: `programStatusFor()` in `services/programs/claim-state.ts`
 *    already maps every claim state to it, which is why a program whose claim
 *    is still in its `objection_window` reads `active` here and is eligible.
 *    Only `claim_pending` is "awaiting approval"; `suspended` and `unclaimed`
 *    are unavailable, which is a different sentence. A reading the caller
 *    could not obtain is `unknown`, and unknown does not pass — a lookup that
 *    failed is not an approval.
 * 3. ROLE — `canUploadForProgram()`, verbatim. The policy ladder and the two
 *    player switches keep exactly the meaning `types.ts` documents; this adds
 *    no rung and removes none.
 * 4. LINE — attaching to a scheduled line is staff-only, as the
 *    `matches_block_client_regraft` trigger enforces. Mirrored here so that,
 *    once a seam asks, the refusal can arrive before the bytes rather than
 *    after them.
 * 5. ATHLETE — whose match this is. In a personal workspace, the uploader's,
 *    by definition. In a team workspace, a live player profile on THIS
 *    program's roster, by selection. Never the uploader's login as a fallback:
 *    ownership is a role, not an athletic identity, and a coach's id on an
 *    athlete's match hands the coach read access the athlete then loses
 *    (`player1_id` is half the `matches` SELECT policy). An owner who also
 *    holds a genuine player profile picks THAT profile, explicitly, and it
 *    passes because it is on the roster — not because they own the program.
 *    A roster the caller has not loaded yet is `unknown`, and unknown does
 *    not pass.
 *
 * The result carries a sentence with every refusal for the reason
 * `explainVideoRefusal()` does: a rule explained one way on the page and
 * another way at the write reads as two rules. `retryable` separates "not
 * decided yet" from "no", so that the page T13 builds can offer Retry for the
 * first and nothing for the second.
 */

import type { ProgramStatus } from "@/lib/services/programs/claim-state";
import {
  canUploadForProgram,
  isProgramStaff,
  NO_BILLING_WORKSPACE_REFUSAL,
  uploadPolicyLabel,
  type Workspace,
} from "./types";

/**
 * A reading of `programs.status` — the workspace's own, or a fresher one a
 * caller re-read (T13 plans that on return to the page and before submit).
 * `"unknown"` is the honest value for a fetch that failed: it is neither
 * approval nor refusal, and it blocks.
 */
export type ProgramApprovalReading = ProgramStatus | "unknown";

/**
 * Who the match is for, as the caller holds it.
 *
 * `self` is the uploader's own login — the only athlete a personal workspace
 * has, and no athlete at all in a team one (see the header). `roster` is an
 * id from the program's roster: a `program_players.id` for a new upload, or —
 * on a row written before profiles existed — the login id of a player-role
 * member. Both eras are accepted because both are on the roster; see
 * `RosterIdentity`. Structurally a superset of the wizard's `MatchSubject`,
 * so that value passes straight through.
 */
export type AthleteChoice =
  { kind: "self" } | { kind: "roster"; playerId: string };

/**
 * One live player on the program's roster, as far as this decision reads it.
 *
 * `playerId` is the `program_players.id` the player's matches carry; `userId`
 * is the login bound to it, when someone has claimed it. Satisfied by
 * `RosterPlayerOption` as-is. The list a caller passes must already be the
 * ELIGIBLE roster: players only, not archived, not merged, this program —
 * which is what `program_roster_full`'s player arm and `rosterPlayerOptions()`
 * produce. This function does not re-derive those filters; it trusts the
 * list, so the list has to be the right one.
 */
export interface RosterIdentity {
  playerId: string;
  userId: string | null;
}

/**
 * The attribution to write — `matches.player1_id`.
 *
 * Echoes the choice, resolved to the id new rows carry: a roster login id
 * resolves to that player's profile id, because the two name one person and
 * the profile id is the stable one. Never a different person, and never the
 * uploader standing in for a missing athlete. A caller CHECKING an existing
 * row (rather than writing one) compares people, not strings: an older row
 * carrying the login id is still that player.
 */
export type ResolvedAthlete =
  { kind: "self"; userId: string } | { kind: "roster"; playerId: string };

export type UploadIneligibilityReason =
  /** The viewer holds no such workspace, or it is suspended / unclaimed. */
  | "workspace-unavailable"
  /** The status could not be read. Not a refusal; not a pass. */
  | "approval-unknown"
  /** `claim_pending` — the program is waiting on a person. */
  | "pending-approval"
  /** `canUploadForProgram()` said no: the policy ladder or a player switch. */
  | "role-restricted"
  /** A scheduled line, and the viewer is not staff. */
  | "line-requires-staff"
  /** The roster has not loaded, or failed to. Not a refusal; not a pass. */
  | "roster-unknown"
  /** A team match with no roster player chosen — including "myself". */
  | "athlete-required"
  /** The chosen id is not a live player on this program's roster. */
  | "athlete-not-on-roster"
  /** A roster athlete in a personal workspace, where there is no roster. */
  | "athlete-not-personal";

export interface UploadEligibilityInput {
  /**
   * The workspace the match files under — the MATCH's, never the switcher's
   * current one for an existing match (`billingWorkspaceFor()`); the active
   * one for a fresh upload. `undefined` is that function's own answer for a
   * program the viewer is not in, and is refused as such.
   */
  workspace: Workspace | undefined;
  /**
   * A fresher `programs.status` than the workspace carries, when the caller
   * re-read it. Omit to trust the workspace's own. Pass `"unknown"` when the
   * re-read failed — that blocks with `retryable: true` rather than falling
   * back to a stale pass.
   */
  approval?: ProgramApprovalReading;
  /** The signed-in uploader — what `self` resolves to in a personal workspace. */
  viewerId: string;
  /** Who played. `null` when nothing has been chosen yet. */
  athlete: AthleteChoice | null;
  /**
   * The program's eligible roster (see `RosterIdentity`). `null` or
   * `undefined` when it has not loaded or the load failed; never read for a
   * personal workspace.
   */
  roster: readonly RosterIdentity[] | null | undefined;
  /** True when the match attaches to a scheduled line (`event_entry_id`). */
  attachesToLine?: boolean;
}

export type UploadEligibility =
  | { ok: true; athlete: ResolvedAthlete }
  | {
      ok: false;
      reason: UploadIneligibilityReason;
      /** One sentence for the person. */
      message: string;
      /**
       * True when nothing has been decided — a reading the caller could not
       * obtain; a consuming page (T13) should offer Retry. False is a refusal
       * a retry will not change, and the page should say why instead.
       */
      retryable: boolean;
    };

/**
 * The approval notice, verbatim from the design: the sentence the wizard is
 * to show on its first visible step while a program is `claim_pending` (T13).
 * One spelling, here, so that notice and the handler guards T14-T16 add
 * cannot say different things about the same program.
 */
export const PENDING_APPROVAL_NOTICE =
  "Your team is awaiting approval. You can upload matches once your claim " +
  "has been approved.";

/**
 * The trigger's own sentence, capitalised the way `explainWriteFailure()`
 * would render the 42501 — so a refusal before the upload reads exactly as
 * the one the database would have raised after it.
 */
export const LINE_REQUIRES_STAFF_REFUSAL =
  "Only a program's staff can attach a match to a scheduled line.";

function refusal(
  reason: UploadIneligibilityReason,
  message: string,
  retryable = false,
): UploadEligibility {
  return { ok: false, reason, message, retryable };
}

/**
 * Which roster row is the viewer themself, or null when none is.
 *
 * The "explicit option": a player sees their own profile in the picker, and
 * an owner who genuinely holds a player profile sees theirs — matched by the
 * login bound to the profile, or by the id the workspace already resolved as
 * theirs (`Workspace.myPlayerId`, which is null for staff). An owner with no
 * such profile gets null, and null is the whole answer: nothing here offers
 * their login id in its place.
 *
 * Returns the ROW, not a `ResolvedAthlete`, so the caller can render it as a
 * roster choice and then submit it through `uploadEligibility()` like any
 * other — the same path, not a privileged one.
 */
export function ownRosterIdentity<T extends RosterIdentity>(
  roster: readonly T[] | null | undefined,
  viewerId: string,
  myPlayerId: string | null,
): T | null {
  if (!roster) return null;
  return (
    roster.find(
      (row) =>
        row.userId === viewerId ||
        (myPlayerId !== null && row.playerId === myPlayerId),
    ) ?? null
  );
}

/**
 * The provider-neutral reading of the role rule. Same three-way split as
 * `explainVideoRefusal()` — staff turned away by the ladder, a player under
 * a policy above them, a player whose own switch is off — because which one
 * it was decides who can fix it. Worded for a match being recorded rather
 * than sent, since an import lands here too. The roster switch is still
 * named as the roster names it.
 */
function roleRefusal(workspace: Workspace): string {
  const policy = uploadPolicyLabel(workspace.uploadPolicy).toLowerCase();

  if (isProgramStaff(workspace)) {
    return (
      `${workspace.name} limits uploads to ${policy}, so a match can't be ` +
      `recorded from your account. The owner can widen it in Team settings.`
    );
  }

  if (workspace.uploadPolicy !== "everyone") {
    return (
      `${workspace.name} limits uploads to ${policy}, so a match can't be ` +
      `recorded from your account. A coach can record it, or the program can ` +
      `open uploads to players in Team settings.`
    );
  }

  return (
    `Uploading for ${workspace.name} isn't switched on for your account. ` +
    `A coach can turn on "Can send video" on your roster row.`
  );
}

/**
 * Decide. See the header for the five questions and their order.
 *
 * Personal workspaces answer only the last two: there is no claim to be
 * pending, no policy to restrict, and no roster — the uploader is the
 * athlete. A roster choice there is a caller holding state from a team
 * workspace it has since left, and is refused rather than quietly rewritten
 * to `self`.
 */
export function uploadEligibility(
  input: UploadEligibilityInput,
): UploadEligibility {
  const { workspace, viewerId, athlete, roster } = input;

  // 1. Workspace.
  if (!workspace) {
    return refusal("workspace-unavailable", NO_BILLING_WORKSPACE_REFUSAL);
  }

  if (workspace.kind === "personal") {
    // A line belongs to a program; the trigger refuses `event_entry_id` on a
    // personal match for exactly that reason (`is_program_staff(null)`).
    if (input.attachesToLine) {
      return refusal("line-requires-staff", LINE_REQUIRES_STAFF_REFUSAL);
    }
    if (athlete?.kind === "roster") {
      return refusal(
        "athlete-not-personal",
        "A personal match is recorded against your own account.",
      );
    }
    return { ok: true, athlete: { kind: "self", userId: viewerId } };
  }

  // 2. Approval — a fresher reading first, else the workspace's own. A team
  //    workspace with no status at all is a constructor that skipped the
  //    select, and that is unknown, not active.
  const status: ProgramApprovalReading =
    input.approval ?? workspace.programStatus ?? "unknown";

  switch (status) {
    case "unknown":
      return refusal(
        "approval-unknown",
        `We couldn't confirm ${workspace.name}'s status. Try again.`,
        true,
      );
    case "claim_pending":
      return refusal("pending-approval", PENDING_APPROVAL_NOTICE);
    case "suspended":
      return refusal(
        "workspace-unavailable",
        `${workspace.name} is suspended, so matches can't be recorded for ` +
          `it until that's resolved.`,
      );
    case "unclaimed":
      return refusal(
        "workspace-unavailable",
        `${workspace.name} isn't an active program, so matches can't be ` +
          `recorded for it.`,
      );
    case "active":
      break;
  }

  // 3. Role — the existing rule, unchanged.
  if (!canUploadForProgram(workspace)) {
    return refusal("role-restricted", roleRefusal(workspace));
  }

  // 4. Line.
  if (input.attachesToLine && !isProgramStaff(workspace)) {
    return refusal("line-requires-staff", LINE_REQUIRES_STAFF_REFUSAL);
  }

  // 5. Athlete. "Myself" is not an athlete here — see the header. Asked
  //    before the roster is, so a page can say "choose who played" while the
  //    list is still loading rather than "try again".
  if (!athlete || athlete.kind === "self") {
    return refusal(
      "athlete-required",
      `Choose who played from ${workspace.name}'s roster. A team match is ` +
        `recorded against a roster player, not the account that uploads it.`,
    );
  }

  if (!roster) {
    return refusal(
      "roster-unknown",
      `We couldn't load ${workspace.name}'s roster. Try again.`,
      true,
    );
  }

  // Either era of id names the same person (`RosterIdentity`); a staff
  // login is on neither side of any row, so it fails here — which is the
  // one check the database's regraft trigger does not make.
  const onRoster = roster.find(
    (row) =>
      row.playerId === athlete.playerId || row.userId === athlete.playerId,
  );
  if (!onRoster) {
    return refusal(
      "athlete-not-on-roster",
      `That player isn't on ${workspace.name}'s roster, so the match can't ` +
        `be recorded for them.`,
    );
  }

  return { ok: true, athlete: { kind: "roster", playerId: onRoster.playerId } };
}
