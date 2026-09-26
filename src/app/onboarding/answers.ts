import type { ProviderId } from "@/lib/services/upload/types";

/**
 * The shared answer vocabulary for the onboarding flow (screens 1.5, 1.7 and
 * 5.2). This module is pure — no `react`, `next/*`, `posthog-js` or
 * `@/lib/supabase/*` imports — so it can be exercised by an offline spec and
 * shared between the client steps (T3), the server actions that persist them
 * (T4) and the acquisition-source follow-up (T5) without pulling either side
 * into the other's dependency graph.
 */

/**
 * Recording source (screen 1.5): how the player captures their matches today.
 * Drives which upload provider — if any — the wizard defaults to via
 * `providerForRecordingSource`.
 */
export const RECORDING_SOURCES = [
  {
    value: "swing-vision",
    label: "SwingVision",
    sub: "Import the .xlsx export from the app.",
  },
  {
    value: "video",
    label: "Phone or camera video",
    sub: "Upload the video and Advantage Intelligence analyses it.",
  },
  {
    value: "none",
    label: "I don't record yet",
    sub: "We'll show you where to put a phone before your next match.",
  },
] as const;

export type RecordingSource = (typeof RECORDING_SOURCES)[number]["value"];

export function isRecordingSource(value: unknown): value is RecordingSource {
  return (
    typeof value === "string" &&
    RECORDING_SOURCES.some((source) => source.value === value)
  );
}

/**
 * Acquisition source (screens 1.7 and 5.2): where the person heard about
 * Advantage Analytics. `playerLabel` and `coachLabel` differ only for
 * `coach_or_teammate` — a player hears it from "a coach or teammate", while a
 * coach hears it from "another coach or program" — every other entry shares
 * one label across both roles.
 */
export const ACQUISITION_SOURCES = [
  {
    value: "coach_or_teammate",
    playerLabel: "A coach or teammate",
    coachLabel: "Another coach or program",
  },
  {
    value: "swingvision_community",
    playerLabel: "SwingVision community",
    coachLabel: "SwingVision community",
  },
  {
    value: "social",
    playerLabel: "Instagram, TikTok or YouTube",
    coachLabel: "Instagram, TikTok or YouTube",
  },
  {
    value: "google",
    playerLabel: "Google search",
    coachLabel: "Google search",
  },
  {
    value: "college_event",
    playerLabel: "A college tennis event",
    coachLabel: "A college tennis event",
  },
  {
    value: "utr",
    playerLabel: "UTR",
    coachLabel: "UTR",
  },
  {
    value: "reddit",
    playerLabel: "Reddit",
    coachLabel: "Reddit",
  },
  {
    value: "linkedin",
    playerLabel: "LinkedIn",
    coachLabel: "LinkedIn",
  },
  {
    value: "other",
    playerLabel: "Somewhere else",
    coachLabel: "Somewhere else",
  },
] as const;

export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number]["value"];

export function isAcquisitionSource(
  value: unknown,
): value is AcquisitionSource {
  return (
    typeof value === "string" &&
    ACQUISITION_SOURCES.some((source) => source.value === value)
  );
}

/** Cap on the free-text "Somewhere else" detail field (screens 1.7 / 5.2). */
export const ACQUISITION_DETAIL_MAX = 120;

/** Roster-size bands (screen 5.2, coach persona): how many players a program carries. */
export const ROSTER_SIZE_BANDS = [
  { value: "1-6", label: "1–6" },
  { value: "7-10", label: "7–10" },
  { value: "11-15", label: "11–15" },
  { value: "16+", label: "16 or more" },
] as const;

export type RosterSizeBand = (typeof ROSTER_SIZE_BANDS)[number]["value"];

export function isRosterSizeBand(value: unknown): value is RosterSizeBand {
  return (
    typeof value === "string" &&
    ROSTER_SIZE_BANDS.some((band) => band.value === value)
  );
}

/** Weekly film volume bands (screen 5.2, coach persona): matches filmed per week. */
export const WEEKLY_FILM_BANDS = [
  { value: "none", label: "None yet" },
  { value: "1-3", label: "1–3" },
  { value: "4-10", label: "4–10" },
  { value: "10+", label: "More than 10" },
] as const;

export type WeeklyFilmBand = (typeof WEEKLY_FILM_BANDS)[number]["value"];

export function isWeeklyFilmBand(value: unknown): value is WeeklyFilmBand {
  return (
    typeof value === "string" &&
    WEEKLY_FILM_BANDS.some((band) => band.value === value)
  );
}

/**
 * The upload provider a recording-source answer implies, if any. `swing-vision`
 * and `video` map onto the wizard's providers of the same shape (`video` runs
 * through the "splitstep"-named processing provider — see AGENTS.md on why
 * that internal name never surfaces); `none` and a missing answer both mean
 * "don't default to a provider."
 */
export function providerForRecordingSource(
  source: RecordingSource | null | undefined,
): ProviderId | null {
  switch (source) {
    case "swing-vision":
      return "swing-vision";
    case "video":
      return "splitstep";
    case "none":
    case null:
    case undefined:
      return null;
  }
}
