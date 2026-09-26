import {
  PILOT_ENDS_AT,
  formatPilotEnd,
  getMonthlyCapHours,
  type AccountType,
} from "../splitstep/config";

/**
 * Pilot terms — the version a coach must have accepted before a team can be
 * created or claimed.
 *
 * The version literal lives in exactly two places that name each other:
 *
 *   * `PILOT_TERMS_VERSION` here
 *   * `public.current_pilot_terms_version()` in
 *     `supabase/migrations/20260926181544_pilot_terms_acceptances.sql`
 *
 * Bump both in the same change (the SQL side is a new migration replacing
 * the function body). A `pilot_terms_acceptances` row whose `terms_version`
 * is not the current one counts as no acceptance — a new version means every
 * coach accepts again before their next creation or claim.
 *
 * The terms' copy itself joins this module with the terms screen (T4), so
 * that the words a coach accepted and the version they accepted under can
 * never drift apart.
 */
export const PILOT_TERMS_VERSION = "2026-fall-pilot-1";

/**
 * SQLSTATE the program-creating RPCs raise when the acting user holds no
 * acceptance for `PILOT_TERMS_VERSION` — `supabase/migrations/
 * *_pilot_terms_enforcement.sql` documents the choice. The server actions
 * around `create_custom_program`, `complete_program_claim` and
 * `complete_program_claim_with_token` map it to the `"terms-not-accepted"`
 * result reason.
 */
export const TERMS_NOT_ACCEPTED_SQLSTATE = "TA001";

/**
 * `/claim/verify`, carrying the signed-in link's token when there is one.
 * Shared by the terms page (its no-session/no-refusal redirects) and
 * `acceptPilotTermsForClaim`'s `next` result, which return to the same
 * Route Handler by two different paths. Lives here rather than in
 * `pilot-terms-actions.ts` because that file's `"use server"` directive
 * limits it to exporting async functions only.
 */
export function verifyHref(token?: string | null): string {
  return token
    ? `/claim/verify?${new URLSearchParams({ token })}`
    : "/claim/verify";
}

// ── The copy ────────────────────────────────────────────────────────────────
//
// Approved 2026-09-26 in `docs/superpowers/specs/2026-09-26-pilot-terms-design.html`
// (frames A, A.1, B and C). Every sentence a coach reads on the terms screen
// is written here and nowhere else, beside the version it was accepted
// under: `pilot-terms-form.tsx` renders from this and holds no term prose of
// its own. Change a sentence and you should be asking whether the version
// above needs a bump.
//
// No number or date is typed into these sentences. The pilot end comes from
// `formatPilotEnd()` and the monthly hours from `getMonthlyCapHours()`, the
// same two functions the wizard meter, Settings › Usage and `reserveQuota()`
// read, so the screen cannot promise an allowance the product doesn't keep.
// `tests/pilot-terms-copy.spec.ts` pins both.

/**
 * Which creation flow the screen sits in. The two differ in their noun
 * ("program" for a claimed college program, "team" for a club, high school or
 * academy team), in the button (the custom screen is the last step before
 * the team exists) and in term 3's wording, which is pending legal review for
 * minors on the custom side.
 */
export type PilotTermsFlow = "college" | "team";

/** One run of a term's sentence. `strong` = ink-900 medium; `figure` adds mono. */
export interface PilotTermsSegment {
  text: string;
  emphasis?: "strong" | "figure";
}

export interface PilotTermsRow {
  /** Blue: what the coach's program gets. Ink: what we reserve. */
  tone: "blue" | "ink";
  segments: readonly PilotTermsSegment[];
}

export interface PilotTermsCopy {
  title: string;
  intro: string;
  /** Terms 1, 2, 4 and 5, in order: the four facts read, not stated. */
  terms: readonly PilotTermsRow[];
  /** Term 3: the one statement the coach makes, so it is the checkbox. */
  confirmation: string;
  button: string;
  pendingButton: string;
  micro: string;
  /** Frame C: the version changed between page load and submit. */
  refused: string;
}

/**
 * The day after `PILOT_ENDS_AT`, when access stops unless a plan is chosen,
 * and its year, which is the year the "options" sentence talks about. Both are
 * derived so a moved end date moves them too.
 */
function accessEnd(): { label: string; year: number } {
  const next = new Date(`${PILOT_ENDS_AT}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(next);
  return { label, year: next.getUTCFullYear() };
}

/**
 * The terms screen's copy for one flow at one quota tier.
 *
 * `accountType` is the tier the new workspace will draw from, i.e.
 * `quotaTierFor(...)` for it: a college program is on the program figure, a
 * custom team on the individual one. The hours are printed from that tier and
 * never chosen by flow, so a future paid custom tier changes the sentence by
 * changing `quotaTierFor()` alone.
 */
export function pilotTermsCopy({
  flow,
  accountType,
}: {
  flow: PilotTermsFlow;
  accountType: AccountType;
}): PilotTermsCopy {
  const noun = flow === "college" ? "program" : "team";
  const hours = getMonthlyCapHours(accountType);
  const end = accessEnd();

  const allowance: PilotTermsSegment[] = [
    { text: "Free through " },
    { text: formatPilotEnd(), emphasis: "strong" },
    { text: ", with " },
    { text: `${hours}h`, emphasis: "figure" },
    {
      text:
        ` of Advantage Intelligence video analysis a month for the ${noun}.` +
        (flow === "team"
          ? " SwingVision imports are free and unlimited."
          : "") +
        " No card and no obligation to buy.",
    },
  ];

  return {
    title: "Fall Season Pilot terms",
    intro: `You accept these once for this ${noun}. Your staff and players won't be asked.`,
    terms: [
      { tone: "blue", segments: allowance },
      {
        tone: "blue",
        segments: [
          {
            text: `We'll share ${end.year} options before the pilot ends. Nothing charges automatically. Access ends ${end.label} unless the ${noun} chooses a paid plan or we extend the pilot.`,
          },
        ],
      },
      {
        tone: "ink",
        segments: [
          { text: "We may use pilot usage and data to improve Advantage." },
        ],
      },
      {
        tone: "ink",
        segments: [
          {
            text: "We may change the monthly hours or end the pilot, and we'll tell you first.",
          },
        ],
      },
    ],
    confirmation:
      flow === "college"
        ? "I can add players to this program and upload match video of them, and my players agree to be filmed and to have their stats analyzed."
        : // "(or their parents)" is pending legal review: high school and
          // academy players are often minors.
          "I can add players to this team and upload match video of them, and my players (or their parents) agree to them being filmed and having their stats analyzed.",
    button:
      flow === "college" ? "Accept and continue" : "Accept and create team",
    pendingButton: flow === "college" ? "Accepting" : "Creating",
    micro: "Free. No card on file.",
    refused:
      "These terms changed while you were reading. Accept the current version to continue.",
  };
}
