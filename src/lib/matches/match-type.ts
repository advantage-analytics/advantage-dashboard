/**
 * The Match type choices, and the one test for "is this a practice session".
 *
 * Dependency-free on purpose: client components and offline specs load it, so
 * it must never import `next/headers` or Supabase.
 *
 * `matches.match_type` is overloaded. Besides the type picked in Edit match,
 * live writers still store the discipline in it (`Singles` / `Doubles` from
 * the schedule writes, the upload wizard's preset seed and `/api/upload`), so
 * `isPracticeMatch` recognises Practice alone and nothing else.
 */

export const MATCH_TYPE_OPTIONS = [
  { value: "Tournament", label: "Tournament" },
  { value: "Dual Match", label: "Dual Match" },
  { value: "Practice", label: "Practice" },
] as const;

/** True only for a stored `match_type` of Practice (any case, any padding). */
export function isPracticeMatch(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "practice";
}
