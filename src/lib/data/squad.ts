/**
 * `programs.team` — which squad a program fields — in one place.
 *
 * Three values and null. A college is always `mens` or `womens`: the two are
 * separate directory rows with separate budgets, and `programs_college_fields_check`
 * refuses anything else. A club, high school or academy may also be `coed`,
 * because one mixed roster under one coach is the ordinary shape there. Null
 * is "never said" — the custom orgs created before the setup form asked — and
 * is NOT a fourth squad: it renders as nothing, and nothing may guess a value
 * for it. Coercing null to "mens" is how a club came to read "Men's tennis" in
 * Settings and get stamped that way on its next save.
 *
 * Pure and import-free on purpose: client components, server loaders and the
 * offline specs all read it.
 */

export const SQUADS = ["mens", "womens", "coed"] as const;

export type Squad = (typeof SQUADS)[number];

/** The two squads a college fields, and the only two the directory lists. */
export type GenderedSquad = "mens" | "womens";

/** The stored value, or null for anything else — never a default. */
export function toSquad(value: unknown): Squad | null {
  return typeof value === "string" &&
    (SQUADS as readonly string[]).includes(value)
    ? (value as Squad)
    : null;
}

/**
 * The squad as the college directory can match it: `coed` and null both mean
 * "no single squad's directory applies", so both read as null.
 */
export function toGenderedSquad(value: unknown): GenderedSquad | null {
  return value === "mens" || value === "womens" ? value : null;
}

/** "Men's" / "Women's" / "Co-ed"; null when the program never said. */
export function squadLabel(squad: Squad | null | undefined): string | null {
  if (squad === "mens") return "Men's";
  if (squad === "womens") return "Women's";
  if (squad === "coed") return "Co-ed";
  return null;
}

/** "M" / "W" / "Co-ed" — the mark beside a team name where space is tight. */
export function squadMark(squad: Squad | null | undefined): string | null {
  if (squad === "mens") return "M";
  if (squad === "womens") return "W";
  if (squad === "coed") return "Co-ed";
  return null;
}

/** May a program of this type field this squad? Mirrors the SQL checks. */
export function isSquadAllowed(
  orgType: string | null | undefined,
  squad: Squad,
): boolean {
  return orgType === "college" ? squad !== "coed" : true;
}

/** The squads a program of this type may choose between, in menu order. */
export function squadsFor(orgType: string | null | undefined): Squad[] {
  return SQUADS.filter((squad) => isSquadAllowed(orgType, squad));
}

/** `{ value, label }` rows for a squad menu — "Men's tennis", "Co-ed tennis". */
export function squadOptionsFor(
  orgType: string | null | undefined,
): { value: Squad; label: string }[] {
  return squadsFor(orgType).map((squad) => ({
    value: squad,
    label: `${squadLabel(squad)} tennis`,
  }));
}
