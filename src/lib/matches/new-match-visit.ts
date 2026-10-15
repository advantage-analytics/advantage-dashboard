/**
 * How `/dashboard/matches/new` reads its own URL — the one decision that has
 * to happen before any of that page's branches run.
 *
 * `?videoFor=` names a DIFFERENT product from every other parameter this route
 * takes. `?draft=`, `?source=`, `?player=` and `?match=` all seed a wizard
 * that will insert or fill a match; `?videoFor=` opens the SwingVision video
 * attachment wizard, which inserts nothing at all. A URL carrying both is not
 * a link anything in this app builds — it is hand-edited or mangled — and the
 * two readings disagree about the most consequential thing on the page.
 *
 * So a conflict is REFUSED rather than resolved by precedence. Preferring
 * either reading silently is how somebody aiming to attach a video to an
 * existing match ends up creating a second, unrelated one instead — the same
 * failure `getAddVideoTarget()` exists to prevent, arriving by a different
 * door. `?mode=` without `?videoFor=` is refused on the same grounds: it names
 * a step order for a subject that is not there, and ignoring it would let a
 * broken link fall through to the match-creation wizard.
 *
 * An unreadable `?mode=` is NOT refused here, deliberately. Where such a
 * visitor should be sent depends on whether they can see the match, which only
 * the authorization ladder knows — so the mode travels on as-is and
 * `resolveAttachmentWizardTarget()` refuses it after asking.
 *
 * Pure, and its own file for the same reason `report-view.ts` is: a page
 * module cannot be imported by a test without dragging the whole client wizard
 * in behind it.
 */

/** Everything `/dashboard/matches/new` reads out of the URL. */
export interface NewMatchSearchParams {
  draft?: string;
  source?: string;
  player?: string;
  match?: string;
  /** The match a video is being attached to. */
  videoFor?: string;
  /** `add` | `replace` | `align`. Only meaningful beside `videoFor`. */
  mode?: string;
  /**
   * Where the wizard goes back to when it is done: `ask` for a visit Ask
   * handed off (`wizardReturnTarget()`). Anything else reads as absent.
   */
  return?: string;
}

/** The pages that hand a visit to the wizard and want it back. */
export type WizardReturnTarget = "ask";

/**
 * The hand-off Ask makes (docs/ask-improvement-roadmap.md, 6.2): the wizard
 * runs as it does today, and its exits — Cancel, the draft's "Save and
 * leave", the success screen's quiet link — lead back to Ask instead of the
 * matches list. The success link names the match it sent (`askReturnHref`),
 * so Ask can say the match is on its way.
 */
export const WIZARD_FROM_ASK_HREF = "/dashboard/matches/new?return=ask";

/** `?return=` as the page reads it: `ask`, or nothing. Never trusted further than that. */
export function wizardReturnTarget(
  params: Pick<NewMatchSearchParams, "return">,
): WizardReturnTarget | null {
  return params.return === "ask" ? "ask" : null;
}

/** Where a visit Ask handed off goes back to, naming the match it sent when there is one. */
export function askReturnHref(matchId: string | null): string {
  return matchId
    ? `/dashboard/ask?sent=${encodeURIComponent(matchId)}`
    : "/dashboard/ask";
}

export type NewMatchVisit =
  | { kind: "create" }
  | { kind: "attach"; matchId: string; mode: unknown }
  | { kind: "refuse" };

export function classifyNewMatchVisit(
  params: NewMatchSearchParams,
): NewMatchVisit {
  const { videoFor, mode, draft, source, player, match } = params;
  if (videoFor === undefined && mode === undefined) return { kind: "create" };
  if (!videoFor) return { kind: "refuse" };
  if (draft || source || player || match) return { kind: "refuse" };
  return { kind: "attach", matchId: videoFor, mode };
}
