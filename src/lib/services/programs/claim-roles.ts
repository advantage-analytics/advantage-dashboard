/**
 * The claim flow's one role vocabulary.
 *
 * Two forms ask "what's your role here" — the claim setup form (F4), where the
 * answer becomes `program_claims.claimant_role`, and the request-an-invite form
 * (6.4), where it becomes `program_requests.role`. The same five answers must
 * mean the same five things in both places, and in the admin queue that reads
 * them back, so the list lives here rather than in either form.
 *
 * The database enforces the same set: `program_requests_role_check` on
 * `program_requests.role` names these values. Adding one here means adding it
 * there too, in the same change.
 */
export const CLAIM_ROLES = [
  { value: "head_coach", label: "Head coach" },
  { value: "assistant_coach", label: "Assistant coach" },
  { value: "director_of_tennis", label: "Director of tennis" },
  { value: "operations", label: "Operations" },
  { value: "other", label: "Other" },
] as const;

export type ClaimRoleValue = (typeof CLAIM_ROLES)[number]["value"];

/**
 * Server-side gate between "what the browser sent" and "what a column admins
 * read will hold". Anything off the list — absent, empty, or tampered with —
 * comes back null, which files the request exactly as one submitted with no
 * role at all.
 */
export function toClaimRole(input: string | null | undefined): ClaimRoleValue | null {
  const match = CLAIM_ROLES.find((role) => role.value === input);
  return match ? match.value : null;
}

/** "head_coach" → "Head coach", for reading a stored value back. */
export function claimRoleLabel(value: string): string {
  const match = CLAIM_ROLES.find((role) => role.value === value);
  return match ? match.label : value.replace(/_/g, " ");
}
