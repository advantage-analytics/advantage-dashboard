/** The four things the admin header's Search finds, in the order it lists them. */
export type AdminSearchKind = "team" | "person" | "match" | "conference";

export const ADMIN_SEARCH_GROUPS: readonly {
  kind: AdminSearchKind;
  label: string;
}[] = [
  { kind: "team", label: "Teams" },
  { kind: "person", label: "People" },
  { kind: "match", label: "Matches" },
  { kind: "conference", label: "Conferences" },
];

/**
 * One row of the admin Search, ready to draw: `adminSearch()` has already
 * built the public image URL, the match's day label and the destination.
 */
export interface AdminSearchHit {
  kind: AdminSearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  /** Where the row opens. Always an `/admin` page. */
  href: string;
  /** Crest (team, conference) or profile photo (person); null draws letters. */
  markUrl: string | null;
  /** Team: school abbreviation. Conference: its short name. Else null. */
  shortCode: string | null;
}
