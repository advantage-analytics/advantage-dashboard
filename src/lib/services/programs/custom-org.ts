/**
 * The self-serve custom org's accepted values, in one place.
 *
 * Here rather than in `create-actions.ts` because that file is `"use server"`,
 * and a server-actions module may export only async functions: the constants
 * could not leave it, so the setup flow's early checks used to carry copies.
 * `create-actions.ts`, `claim/team/actions.ts` and `claim/team/pending-team.ts`
 * all read these now.
 *
 * 'college' is deliberately not an accepted type here or in SQL: collegiate
 * programs enter through the seeded directory and the claim flow, never
 * through self-serve creation.
 */
export const CUSTOM_ORG_TYPES = [
  "club",
  "high_school",
  "academy",
  "other",
] as const;

export type CustomOrgType = (typeof CUSTOM_ORG_TYPES)[number];

/** Mirrors the SQL bounds; the RPC is the enforcement, these are the fast no. */
export const CUSTOM_ORG_NAME_MIN = 2;
export const CUSTOM_ORG_NAME_MAX = 120;

/**
 * The coach's own name on the setup form. Not a column bound: it goes to
 * `users.first_name`/`last_name`. Capped so the field and the setup action
 * agree, and so an over-long name is reported as a name, not as something else.
 */
export const OWNER_NAME_MAX = 120;

export function isCustomOrgType(value: unknown): value is CustomOrgType {
  return (
    typeof value === "string" &&
    (CUSTOM_ORG_TYPES as readonly string[]).includes(value)
  );
}
