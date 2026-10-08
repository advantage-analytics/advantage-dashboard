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

/** The report tab a step switches to (via `?tab=`) before anchoring. */
export type TourTab = "shots" | "film";

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
      title: "Match summary",
      body: "A short read of the match that names the one thing that decided it.",
    },
    {
      target: "head-to-head",
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
      body: "The match video, cut to the points so you can jump straight to any rally.",
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
      title: "Your summary",
      body: "A short read of your match that names the one thing that decided it.",
    },
    {
      target: "head-to-head",
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
      body: "Your match video, cut to the points so you can jump straight to any rally.",
    },
  ],
};

/**
 * The tour's steps whose target is on the page, in tour order. A report with
 * no film or no points drops those steps; when nothing is present the result
 * is empty and the tour never opens.
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
  /** Finished (analysed) matches the viewer has created. */
  finishedMatchCount: number;
  /** `users.first_report_tour_done_at`. */
  doneAt: string | null;
}

/**
 * Whether the match page mounts the first-report tour. Exactly one finished
 * match is what keeps players with a history from ever seeing it.
 */
export function firstReportTourEligible({
  workspaceKind,
  isCreator,
  finishedMatchCount,
  doneAt,
}: FirstReportTourFacts): boolean {
  return (
    workspaceKind === "personal" &&
    isCreator &&
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
  /** Finished (analysed) matches the user has created. */
  finishedMatchCount: number;
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
 * as done, so a veteran's line is unchanged by them.
 */
export function setupSteps(facts: SetupFacts): SetupStep[] {
  const veteran = facts.finishedMatchCount > 1;
  return [
    {
      key: "sampleTour",
      label: "See the sample report",
      href: "/dashboard/matches/sample?tour=1",
      link: "Open sample",
      done: facts.sampleTourDoneAt !== null || veteran,
    },
    {
      key: "firstReportTour",
      label: "Read your first report",
      href: "/dashboard/matches",
      link: "Open matches",
      done: facts.firstReportTourDoneAt !== null || veteran,
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
