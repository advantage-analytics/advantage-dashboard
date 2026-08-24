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
  /**
   * `programs.players_can_upload` — may this program's *players* send video,
   * or only its staff?
   *
   * Always false for a personal workspace, where it means nothing: there is
   * one member and they are the owner.
   *
   * It rides on the workspace for the same reason `canSubmitVideo` does. The
   * upload page reads it to decide who it admits, and `landingPath()` in
   * `workspace/actions.ts` has to predict that answer *before* navigating —
   * with only a `Workspace` to go on. Leaving it in the database would mean
   * the switcher guessing at a rule it cannot see, and diverting a player to
   * the schedule from a page that would have let them in.
   *
   * Orthogonal to `canSubmitVideo` and not a substitute for it: that one is
   * the claim state — may *anyone* here spend the budget yet — and this one is
   * who, among the people who may, is allowed to start.
   *
   * `program_members.upload_enabled` is a THIRD, per-person answer to a
   * similar-sounding question, and it rides here too — as
   * `memberUploadEnabled`, below. The two compose in one direction only: this
   * flag says whether a program's players may upload at all, that one says
   * whether THIS player may, and a player needs both to pass. Staff need
   * neither.
   *
   * That was not true of any deployed code until `canUploadForProgram()` below
   * started reading it, alongside
   * `20260824223337_enforce_member_upload_enabled.sql`. The column had been
   * written since the membership migration — by invite acceptance, by claim
   * completion — and read straight back by `program_roster_full` to render the
   * roster's "Can send video" switch, while no policy, no trigger and no page
   * gated an upload on it. `20260818040338`'s `comment on column` for
   * `programs.players_can_upload` claimed otherwise ("A member still needs
   * program_members.upload_enabled"), and this doc comment carried the
   * correction, because an applied migration is never edited in place
   * (`.claude/skills/create-migration/SKILL.md`).
   *
   * The migration that made that sentence true restated it in the database in
   * the same breath, which is what a schema change buys that a COMMENT-only
   * migration would not have. So `\d+ public.programs` and this file now agree,
   * and neither is the other's correction.
   */
  playersCanUpload: boolean;
  /**
   * `program_members.upload_enabled` — may THIS member spend the budget?
   *
   * The per-person half of the question `playersCanUpload` answers for players
   * in general. A coach handing the budget to one senior without opening it to
   * the whole squad is the ordinary case, and a single program-wide toggle
   * cannot express it — which is why the roster row carries a "Can send video"
   * switch of its own, writing through `set_member_upload_enabled`.
   *
   * IT ONLY EVER NARROWS A PLAYER. `canUploadForProgram()` answers for staff
   * before it reads this, so an owner or coach whose row says false is
   * unaffected — there is no arrangement of switches that locks a program's
   * staff out of their own budget.
   *
   * True for a personal workspace: there is no membership row to consult, the
   * viewer is the only member, and "may this person send their own video" has
   * one honest answer there. Unlike `playersCanUpload`, false would not be the
   * conservative reading — it would be a claim that this person is barred.
   *
   * Resolved server-side with the rest of the workspace for the same reason
   * `playersCanUpload` is: `landingPath()` has to predict the upload page's
   * answer with only a `Workspace` in hand.
   */
  memberUploadEnabled: boolean;
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

/**
 * May this viewer open the program's upload wizard?
 *
 * Staff always. A player needs two answers pointing the same way: the
 * program's `players_can_upload`, which the settings form has offered as
 * "anyone" vs "coaches" since it shipped while nothing read the answer, and
 * their own `program_members.upload_enabled`, which the roster row's "Can send
 * video" switch writes. Policy for players in general, then this player.
 *
 * Staff are answered by the early return and never reach the second half, so
 * `upload_enabled` narrows a player and nobody else. That is deliberate: a
 * coach's own row carries whatever an invitation happened to leave there, and
 * letting it decide would lock a program's staff out of its budget by
 * accident. It also means the roster's switch is only worth offering on a
 * player's row.
 *
 * The single spelling of the rule, for the same reason `isProgramStaff` is:
 * `team/upload/page.tsx` enforces it and `landingPath()` predicts it, and a
 * workspace switch that lands on a page which then bounces is the exact bug
 * that map exists to prevent. Neither is authorization — the database is (see
 * `matches_block_client_regraft`, which requires membership to file a match
 * under a program) — but they have to agree with each other.
 *
 * This admits someone to the page; it does not say what they may file there.
 * Attaching a match to a SCHEDULED LINE is a stricter rule that the same
 * trigger enforces on `event_entry_id` and only staff pass, so the page keeps
 * `isProgramStaff` for that half. Widening this predicate to cover it would
 * hand a player a queue of lines the database will refuse.
 */
export function canUploadForProgram(workspace: Workspace): boolean {
  if (workspace.kind !== 'team') return false;
  if (isProgramStaff(workspace)) return true;
  return workspace.playersCanUpload && workspace.memberUploadEnabled;
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
