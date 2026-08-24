/**
 * Workspaces — the personal/team split the collegiate pilot introduces.
 *
 * A workspace is the scope every query runs inside. There are exactly two
 * kinds and they are not a filter over one dataset: a personal workspace is
 * one player's own matches, a team workspace is a collegiate program with
 * members, roles, and a shared 75-hour monthly budget. They get different
 * navigation because they are different products.
 *
 * One user may hold several — a coach running both the men's and women's teams
 * is common — so this is a switcher, never a boolean on the user row.
 *
 * See `docs/ui-revamp-guardrails.md` and the program claim spec for why
 * membership lives in its own table rather than on `users.role`: that column is
 * nullable free text with no constraint, and overloading it would make an
 * entitlement out of a field nothing validates.
 */

/** A member's standing inside a team workspace. Personal is always `owner`. */
export type ProgramRole = 'owner' | 'coach' | 'staff' | 'player';

export type WorkspaceKind = 'personal' | 'team';

export interface Workspace {
  /**
   * The account this workspace bills and scopes against — the user's id for a
   * personal workspace, the program's id for a team one. This is the value
   * that becomes `processing_usage.account_id`, so the two kinds share one
   * ledger rather than needing a second table.
   */
  id: string;
  kind: WorkspaceKind;
  /** "Personal", or the school name for a program. */
  name: string;
  /** Which squad, where a school fields both. Null for personal workspaces. */
  team: 'mens' | 'womens' | null;
  /** The viewer's role here — drives what the workspace is allowed to show. */
  role: ProgramRole;
  /** One or two characters for the switcher's mark. */
  mark: string;
  /**
   * May video be submitted against this workspace's allowance yet?
   *
   * Always true for a personal workspace. For a program it follows the claim:
   * one still in `pending_review` can invite and browse but must not spend the
   * budget, because that spend cannot be taken back. `canSubmitVideo()` in
   * `services/programs/claim-state.ts` is the rule; this is where its answer
   * has to live, or the switcher and the upload wizard end up asking different
   * questions about the same program.
   */
  canSubmitVideo: boolean;
}

/** Everything the dashboard shell needs to render, resolved once per request. */
export interface WorkspaceContextValue {
  active: Workspace;
  available: Workspace[];
  /** The signed-in person, for the profile menu and sidebar footer. */
  viewer: Viewer;
}

export interface Viewer {
  id: string;
  email: string;
  /** Display name, already falling back to the email local part. */
  name: string;
  initials: string;
  /** `users.plan` — 'free' | 'pro'. The paid entitlement, and only that. */
  plan: string;
  /**
   * `users.role` — the self-described persona (player/coach/parent/academy).
   * Shapes what the app shows; never what the account is entitled to. See
   * `lib/user/roles.ts` for why those two had to be split.
   */
  role: string | null;
  /** `users.created_at` as "Mon YYYY", or null for a row without one. */
  memberSince: string | null;
}

/**
 * May this viewer administer the active workspace?
 *
 * The presentation-side twin of the SQL `is_program_staff`, and the single
 * spelling of a rule the rail and the Team page each used to write in the
 * opposite direction ("kind === team && role !== player" vs "kind !== team ||
 * role === player"). Neither is authorization — the database is — but they have
 * to agree, or a rail item bounces you off the page it points at.
 */
export function isProgramStaff(workspace: Workspace): boolean {
  return workspace.kind === 'team' && workspace.role !== 'player';
}

/** The label under the workspace name in the switcher. */
export function workspaceSubtitle(workspace: Workspace): string {
  return workspace.kind === 'team' ? 'Team workspace' : 'Personal workspace';
}

/**
 * Squad shown beside a team workspace's name.
 *
 * Men's and women's programs at one school are separate workspaces with
 * separate budgets, so the switcher has to tell them apart — two rows reading
 * only "Meridian State" would be a coin flip.
 */
export function teamLabel(team: Workspace['team']): string | null {
  if (team === 'mens') return "Men's";
  if (team === 'womens') return "Women's";
  return null;
}

/**
 * The header's leading slot on the pages whose subject is the workspace itself
 * rather than a position within a flow (design 9g).
 *
 * The school carries the weight and the squad is a quiet qualifier beside it,
 * so the two are returned separately rather than joined into one string: the
 * caller renders them as two spans in different type, and a workspace with no
 * squad to name — every personal one, and a program that fields a single team —
 * must render the name alone rather than an empty element and its gap.
 *
 * `teamLabel()` yields the possessive on its own because the switcher already
 * sits under the word "workspace"; a header naming nothing else has to say what
 * sport it is.
 */
export function workspaceTitle(workspace: Workspace): {
  name: string;
  qualifier: string | null;
} {
  const squad = teamLabel(workspace.team);
  return {
    name: workspace.name,
    qualifier: squad ? `${squad} tennis` : null,
  };
}
