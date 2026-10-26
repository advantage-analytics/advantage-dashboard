import { COURT_OPTIONS } from "@/components/dashboard/matches/new-match-wizard/court-options";

/**
 * Every value admission takes: the Court field's own (`COURT_OPTIONS`, the
 * shared wizard's list), plus the bare labels older admin uploads sent.
 */
const ACCEPTED_COURTS = new Set([
  ...COURT_OPTIONS.map((option) => option.value),
  "Hard",
  "Clay",
  "Grass",
  "Carpet",
]);

/** The shared wizard stores full court labels; an unanswered optional field is null. */
export function adminUploadCourt(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  return typeof value === "string" && ACCEPTED_COURTS.has(value)
    ? value
    : undefined;
}
