import type { RecordingSource } from "@/app/onboarding/answers";
import type { WorkspaceKind } from "@/lib/workspace/types";

/**
 * The first-run report tours, their eligibility and the getting-set-up steps
 * that track them. Pure — no `react` or `next/*` imports, like
 * `src/app/onboarding/steps.ts` — so every rule here is pinned by an offline
 * spec (`tests/onboarding-tours.spec.ts`) without rendering a report.
 *
 * Design: `work/first-run-onboarding/02_design/output/design.md` §5 (steps),
 * §7 (entry points), §8 (first-report eligibility) and §9 (`SetupLine`).
 */

export type TourId = "sample" | "first-report";

/**
 * The `data-tour="<id>"` attribute values a report renders. Adding these
 * attributes is the only change the tour makes to existing report components.
 */
export const TOUR_TARGETS = [
  "scoreboard",
  "insight",
  "head-to-head",
  "shots",
  "film",
] as const;

export type TourTarget = (typeof TOUR_TARGETS)[number];

/** The report view a step switches to (via `?tab=`) before anchoring. */
export type TourTab = "statistics" | "shots" | "film";

/**
 * The view each target is rendered in, or `null` for the rail, which every
 * view keeps. The runner uses it to tell a target that is merely out of view
 * (the Statistics sections while Film is open) from one the report never
 * rendered: only the latter drops its step before the tour opens.
 */
export const TOUR_TARGET_VIEW: Record<TourTarget, TourTab | null> = {
  scoreboard: null,
  insight: "statistics",
  "head-to-head": "statistics",
  shots: null,
  film: null,
};

/**
 * `users` column each tour stamps when it is finished or skipped. Shared by
 * the `markTourDone` action (the write) and `getTourDoneAt` (the read), so
 * the two can never name different columns. Exported from here, a plain
 * module, because the action file is `"use server"` and may export only
 * async functions.
 */
export const TOUR_COLUMN = {
  sample: "sample_tour_done_at",
  "first-report": "first_report_tour_done_at",
} as const satisfies Record<TourId, string>;

export interface TourStep {
  target: TourTarget;
  tab?: TourTab;
  title: string;
  /** One sentence. */
  body: string;
}

export const TOURS: Record<TourId, readonly TourStep[]> = {
  sample: [
    {
      target: "scoreboard",
      title: "Scoreboard",
      body: "The score set by set, with who served and who won each game.",
    },
    {
      target: "insight",
      tab: "statistics",
      title: "Match summary",
      body: "A short read of the match that names the one thing that decided it.",
    },
    {
      target: "head-to-head",
      tab: "statistics",
      title: "Head-to-head",
      body: "Each player's serve, return and rally numbers side by side.",
    },
    {
      target: "shots",
      tab: "shots",
      title: "Serve placement",
      body: "Where every serve landed, split by first and second serve.",
    },
    {
      target: "film",
      tab: "film",
      title: "Film",
      body: "The match video, with a point list so you can jump straight to any rally.",
    },
  ],
  "first-report": [
    {
      target: "scoreboard",
      title: "Your scoreboard",
      body: "Your score set by set, with who served and who won each game.",
    },
    {
      target: "insight",
      tab: "statistics",
      title: "Your summary",
      body: "A short read of your match that names the one thing that decided it.",
    },
    {
      target: "head-to-head",
      tab: "statistics",
      title: "Head-to-head",
      body: "Your serve, return and rally numbers set against your opponent's.",
    },
    {
      target: "shots",
      tab: "shots",
      title: "Your serve placement",
      body: "Where each of your serves landed, split by first and second serve.",
    },
    {
      target: "film",
      tab: "film",
      title: "Your film",
      body: "Your match video, with a point list so you can jump straight to any rally.",
    },
  ],
};

/**
 * The tour's steps whose target is on the page, in tour order. A report with
 * no film or no points drops those steps; when nothing is present the result
 * is empty and the tour never opens. The runner passes every target it has
 * not seen missing from its own view (`TOUR_TARGET_VIEW`), and calls again as
 * a step's target turns out never to appear — so the count a step prints can
 * shrink, but never names a step the report has already been seen to lack.
 */
export function resolveSteps(
  tour: TourId,
  presentTargets: Iterable<TourTarget>,
): TourStep[] {
  const present = new Set<TourTarget>(presentTargets);
  return TOURS[tour].filter((step) => present.has(step.target));
}

/**
 * Where a solo player lands when onboarding finishes, by how they record:
 * straight into the upload wizard (pre-selecting SwingVision for an import),
 * or — with nothing to upload yet — into the sample report's tour.
 */
export function soloDestination(
  recordingSource: RecordingSource | null,
): string {
  switch (recordingSource) {
    case "video":
      return "/dashboard/matches/new";
    case "swing-vision":
      return "/dashboard/matches/new?source=swing-vision";
    default:
      return "/dashboard/matches/sample?tour=1";
  }
}

export interface FirstReportTourFacts {
  workspaceKind: WorkspaceKind;
  /** The viewer created the match being shown. */
  isCreator: boolean;
  /** `matches.program_id` of the match being shown: `null` for a personal match. */
  matchProgramId: string | null;
  /** The match being shown has published statistics — a report to tour. */
  statsPublished: boolean;
  /**
   * Finished (analysed) matches the viewer has created, or `null` when the
   * count could not be read.
   */
  finishedMatchCount: number | null;
  /**
   * `users.first_report_tour_done_at`: `null` when never finished, `undefined`
   * when it could not be read (`getTourDoneAt`).
   */
  doneAt: string | null | undefined;
}

/**
 * Whether the match page mounts the first-report tour: a personal match the
 * viewer filed, in their personal workspace, with a report to read — exactly
 * one finished match is what keeps players with a history from ever seeing
 * it. A match whose statistics were never published (`stats_unavailable`)
 * has no report to tour, so it is not the first one. Either fact the page
 * could not read answers "no": a tour that waits for the next report is
 * harmless, one pushed at someone who already dismissed it is not.
 */
export function firstReportTourEligible({
  workspaceKind,
  isCreator,
  matchProgramId,
  statsPublished,
  finishedMatchCount,
  doneAt,
}: FirstReportTourFacts): boolean {
  return (
    workspaceKind === "personal" &&
    isCreator &&
    matchProgramId === null &&
    statsPublished &&
    finishedMatchCount === 1 &&
    doneAt === null
  );
}

/**
 * The facts the getting-set-up line (`SetupLine`,
 * `src/components/dashboard/home/setup-line.tsx`) is built from, every one
 * read back out of the database by Home's `Footer` region in
 * `src/app/dashboard/(home)/page.tsx`.
 */
export interface SetupFacts {
  /** `users.sample_tour_done_at`. */
  sampleTourDoneAt: string | null;
  /** `users.first_report_tour_done_at`. */
  firstReportTourDoneAt: string | null;
  /**
   * Finished (analysed) matches the user has created, or `null` when the
   * count could not be read.
   */
  finishedMatchCount: number | null;
  /** `users.hand` and `users.backhand` are both set. */
  playingProfile: boolean;
  /** A `user_preferences` row exists. */
  notifications: boolean;
}

export type SetupStepKey =
  "sampleTour" | "firstReportTour" | "playingProfile" | "notifications";

export interface SetupStep {
  key: SetupStepKey;
  /** How the step reads on the getting-set-up line, as its own sentence. */
  label: string;
  href: string;
  link: string;
  done: boolean;
}

/**
 * The getting-set-up steps in order: the two tours, then playing profile and
 * preferences. An account with more than one finished match counts both tours
 * as done, so a veteran's line is unchanged by them. An unknown count
 * (`null`) counts them as done too: without it a veteran cannot be told from
 * a newcomer, and the line must not ask a veteran to take a tour — the
 * profile and preferences steps still read from their own facts.
 */
export function setupSteps(facts: SetupFacts): SetupStep[] {
  const toursSettled =
    facts.finishedMatchCount === null || facts.finishedMatchCount > 1;
  return [
    {
      key: "sampleTour",
      label: "See the sample report",
      href: "/dashboard/matches/sample?tour=1",
      link: "Open sample",
      done: facts.sampleTourDoneAt !== null || toursSettled,
    },
    {
      key: "firstReportTour",
      label: "Read your first report",
      href: "/dashboard/matches",
      link: "Open matches",
      done: facts.firstReportTourDoneAt !== null || toursSettled,
    },
    {
      key: "playingProfile",
      label: "Hand and backhand",
      href: "/dashboard/settings/profile",
      link: "Open profile",
      done: facts.playingProfile,
    },
    {
      key: "notifications",
      label: "How you hear that a report is ready",
      href: "/dashboard/settings/preferences",
      link: "Open preferences",
      done: facts.notifications,
    },
  ];
}
