/**
 * Which activity-tray rows are failures, where a click on one goes, and the
 * one-line reason it carries (Direction E on the design canvas, author's
 * choice 2026-09-28).
 *
 * The tray draws its failed rows on one truncating line — no card, no
 * headline/body split like the match page's failure alert (`analysis-failure-
 * copy.ts`'s `byClass`) — so this module re-derives the tray's own, shorter
 * shape from the same `recovery` classification rather than reusing that
 * copy's full sentences.
 *
 * No React, no Next: pure functions over `MatchAnalysis`-shaped input, so a
 * spec can assert every case without rendering anything, matching
 * `tray-detail.ts` beside it.
 */
import {
  matchListGroup,
  analysisAction,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";
import {
  TRAY_REASON,
  waitOrAskVariant,
} from "@/components/dashboard/matches/analysis-failure-copy";
import { STEPPER_COPY } from "@/components/dashboard/matches/match-detail/analysis-steps";

/**
 * Is this row one the tray's Failed section should carry?
 *
 * Exactly `matchListGroup(analysis) === "Failed"` — no re-derivation of that
 * decision here — with one deliberate divergence (author's choice,
 * 2026-09-28, Direction E): an `uploaded` row carrying a `recovery` is a
 * stalled hand-off, server-classified by the same loader that already
 * decides `isSubmitStalled()` at read time, so `recovery` is only ever
 * present here because the classifier already saw the stall. `matchListGroup`
 * keeps that row under "In progress" — the matches list is not this tray's
 * decision to change — but a stalled upload has stopped moving exactly like a
 * failure, and the match page (T23) and both drawers (T25/T26) already draw
 * it as stopped. No clock lives here: whether a given `uploaded` row is
 * stalled was decided server-side before this ran, so a row that stalls while
 * the tray is open simply flips on the next navigation.
 *
 * `stats_unavailable` reads "Ready" under `matchListGroup` (the match renders
 * fine; only a chart is missing), and every other in-flight status groups
 * under "In progress", so both still come back `false`.
 */
export function isTrayFailure(
  analysis: Pick<MatchAnalysis, "status" | "recovery"> | null | undefined,
): boolean {
  if (analysis?.status === "uploaded") return analysis.recovery != null;
  return matchListGroup(analysis) === "Failed";
}

export interface TrayFailureAction {
  label: string;
  href: string;
}

/**
 * The tray row's single action: which word it uses and where it points.
 *
 * Hrefs are never retyped here — they come straight out of `analysisAction`,
 * the one function that already knows `addVideoHref` vs. the match page vs.
 * the upload wizard's fresh-start route. Only the label is the tray's own:
 * "Open" is its short word for `analysisAction`'s "View match" — the row
 * itself is the link, so the label only has to say where the click goes, not
 * repeat what "the match page has the details" already told the reader.
 *
 * `retry` / `rederive` / `wait_or_ask` all resolve to "Open" at the match
 * page: there is nothing left to press from the tray for any of them — a
 * retry or rebuild control lives on the page itself, and `wait_or_ask` has no
 * control to offer at all. The tray never POSTs `/resubmit` or `/rederive`
 * itself.
 */
export function trayFailureAction(
  analysis: Pick<MatchAnalysis, "recovery">,
  matchId: string,
): TrayFailureAction {
  const action = analysisAction(
    { status: "failed", recovery: analysis.recovery } as MatchAnalysis,
    matchId,
  );
  // A failed row always gets an action out of `analysisAction` (Add video,
  // View match, or the "Start over" fallback) — never null or href-less.
  const href = action?.href ?? "/dashboard/matches/new";

  switch (analysis.recovery) {
    case "retry":
    case "rederive":
    case "wait_or_ask":
      return { label: "Open", href };
    default:
      // upload_again / fix_recording → "Add video"; no recovery → "Start
      // over" — both already the exact label the tray wants.
      return { label: action?.label ?? "Start over", href };
  }
}

/**
 * The tray's one-line reason, drawn on a truncating row so it stays short on
 * purpose. `wait_or_ask` reads through `waitOrAskVariant` on the row's own
 * `errorCode`/`attemptsUsed`, the same disambiguation the match page uses.
 *
 * `status` is optional — the T32 callers that already pinned this function
 * never carried one, and every `isTrayFailure` row this file has ever seen
 * before T34 was a genuine `failed`/`derivation_failed` row anyway. A stalled
 * `uploaded` row is the one case that needs it: it reads the stepper's own
 * `STEPPER_COPY.titles.stalled` ("Couldn't send for analysis") rather than
 * `retry`'s ordinary "Analysis stopped · retry available" — the hand-off
 * never happened, so nothing has actually failed and retried yet.
 *
 * Except when the stall has a known cause. A stalled `wait_or_ask` row was
 * held back by the allowance, a permission, or the attempt ceiling, and that
 * cause is the more useful line: "Couldn't send" says what, the variant says
 * why and who can fix it. So `wait_or_ask` reads its variant whether or not
 * the row is stalled, and only a stalled `retry` row takes the stalled title.
 */
export function trayFailureReason(
  analysis: Pick<MatchAnalysis, "recovery" | "errorCode" | "attemptsUsed"> & {
    status?: MatchAnalysis["status"];
  },
): string {
  if (analysis.status === "uploaded" && analysis.recovery !== "wait_or_ask") {
    return STEPPER_COPY.titles.stalled;
  }
  switch (analysis.recovery) {
    case "upload_again":
    case "fix_recording":
    case "retry":
    case "rederive":
      return TRAY_REASON[analysis.recovery];
    case "wait_or_ask":
      return TRAY_REASON.wait_or_ask[waitOrAskVariant(analysis.errorCode)];
    // `stats_unavailable` never reaches the tray (`isTrayFailure` excludes
    // it via `matchListGroup`); undefined is the unclassified case.
    case "stats_unavailable":
    case undefined:
      return TRAY_REASON.none;
  }
}
