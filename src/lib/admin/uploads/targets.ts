/**
 * One row of the console's "Upload for" search: a team, or a player whose
 * personal workspace the match goes into. A leaf — the wizard's client
 * components import it.
 */
export interface AdminUploadTargetHit {
  kind: "team" | "player";
  /** `programs.id` for a team, the player's user id for a player. */
  id: string;
  title: string;
  subtitle: string | null;
  markUrl: string | null;
}
