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

/**
 * Is this row one the tray's Failed section should carry?
 *
 * Exactly `matchListGroup(analysis) === "Failed"` — no re-derivation of that
 * decision here. `stats_unavailable` reads "Ready" there (the match renders
 * fine; only a chart is missing), and every in-flight status groups under
 * "In progress", so both come back `false`.
 */
export function isTrayFailure(
  analysis: Pick<MatchAnalysis, "status" | "recovery"> | null | undefined,
): boolean {
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
 */
export function trayFailureReason(
  analysis: Pick<MatchAnalysis, "recovery" | "errorCode" | "attemptsUsed">,
): string {
  switch (analysis.recovery) {
    case "upload_again":
    case "fix_recording":
    case "retry":
    case "rederive":
      return TRAY_REASON[analysis.recovery];
    case "wait_or_ask":
      return TRAY_REASON.wait_or_ask[
        waitOrAskVariant(analysis.errorCode, analysis.attemptsUsed ?? 0)
      ];
    // `stats_unavailable` never reaches the tray (`isTrayFailure` excludes
    // it via `matchListGroup`); undefined is the unclassified case.
    case "stats_unavailable":
    case undefined:
      return TRAY_REASON.none;
  }
}
