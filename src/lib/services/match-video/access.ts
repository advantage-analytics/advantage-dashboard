/**
 * Who may touch a match's video — asked once, here, for every attachment
 * route (plan step 6, "centralize cookie-user, RLS visibility, creator,
 * provider, and active workspace checks").
 *
 * Two questions, in a fixed order, each answered before the next is asked:
 *
 *   {@link authorizeMatchVisibility}     sign-in, then the match through the
 *                                        caller's OWN client, so RLS decides
 *                                        whether it exists for them. Enough
 *                                        for playback (T12).
 *   {@link authorizeMatchVideoMutation}  all of that, then: the caller
 *                                        created the match, the match is a
 *                                        SwingVision import, and the ACTIVE
 *                                        workspace is the match's own scope.
 *                                        Required before any reserve, renew,
 *                                        cancel, complete or align (T8–T11).
 *   {@link authorizeMatchVideoRemoval}   visibility, then: the caller uploaded
 *                                        this attachment, or is an owner or
 *                                        coach of the match's program. The
 *                                        one write that is NOT creator-only
 *                                        (SwingVision Add video T5).
 *
 * Every privileged step downstream — the service-role RPCs, the SAS signer —
 * is reached only through a {@link MatchVideoMutationAccess}, and the only
 * way to obtain one is to pass this module's checks: the type is branded
 * with a symbol this file never exports, so a route cannot assemble one from
 * a request body, a query string, or anything else the caller wrote. The
 * actor is the session; the workspace is the switcher cookie as
 * `getWorkspaceContext()` validated it against membership. Neither is
 * negotiable per request, which is why neither is a parameter.
 *
 * "Exact workspace" means the match's own scope and nothing broader. A
 * personal match (no `program_id`) needs the personal workspace, whose id is
 * the actor's own; a team match needs the team workspace for THAT program.
 * Being a member of the program is implied — `getWorkspaceContext()` only
 * ever offers workspaces the caller belongs to — and rechecked in SQL by
 * `match_video_authorize_match` anyway. This helper is the gate that keeps a
 * refused request from ever reaching that SQL or minting anything.
 *
 * Dependency-injected (`MatchVideoAccessDeps`) so the whole refusal ladder
 * runs in a spec with no session, no database and no storage.
 * {@link matchVideoAccessDeps} is the production wiring; route files call it
 * with the real Supabase client and `getWorkspaceContext`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fail, ok, type MatchVideoResult } from "@/lib/match-video/types";
import type { Workspace, WorkspaceKind } from "@/lib/workspace/types";

/* -------------------------------------------------------------------------
 * Shapes
 * ---------------------------------------------------------------------- */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A syntactically valid UUID — the only shape a match or attachment id has. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** The columns of `matches` every access decision reads. */
export interface VisibleMatchRow {
  id: string;
  created_by: string | null;
  /** NULL is a personal match; a program id is a team match. */
  program_id: string | null;
  /** `'swing-vision'` is the only provenance an attachment can align to. */
  source_provider: string | null;
}

export interface MatchVideoAccessDeps {
  /** The signed-in login, or null. */
  currentUserId(): Promise<string | null>;
  /**
   * The match by id through the CALLER's client, so RLS answers "does this
   * exist for you" — never the service role, which would answer for
   * everyone. `error` is a failed read, distinct from an absent row.
   */
  loadVisibleMatch(
    matchId: string,
  ): Promise<{ match: VisibleMatchRow | null; error: string | null }>;
  /**
   * The active workspace — `getWorkspaceContext().active`, which is the
   * switcher cookie validated against membership. Null when there is no
   * context at all (no session), which the sign-in check already caught.
   */
  activeWorkspace(): Promise<Pick<Workspace, "id" | "kind"> | null>;
}

/**
 * The two extra reads removal needs. Kept off {@link MatchVideoAccessDeps}
 * so no existing route has to provide them.
 */
export interface MatchVideoRemovalAccessDeps extends MatchVideoAccessDeps {
  /**
   * `uploaded_by` of the attachment filed under THIS match, through the
   * service role (the table has no client-role access). `attachment` is null
   * when no row has that id on that match. Any state: whether a retired or
   * pending row may be "removed" is the RPC's call, not this check's.
   */
  loadAttachmentUploader(
    matchId: string,
    attachmentId: string,
  ): Promise<{
    attachment: { uploaded_by: string | null } | null;
    error: string | null;
  }>;
  /**
   * `userId`'s `program_members.role` in `programId`, through the CALLER's
   * client — its select policy always shows a member their own row. `userId`
   * is always the session's own id. Null when there is no membership there.
   */
  loadProgramRole(
    programId: string,
    userId: string,
  ): Promise<{ role: string | null; error: string | null }>;
}

/** The session's identity. Never a request field. */
export interface MatchVideoActor {
  readonly id: string;
}

/** The validated active workspace, in the form the T3/T4 RPCs take it. */
export interface MatchVideoWorkspaceScope {
  readonly kind: WorkspaceKind;
  /** `Workspace.id`: the actor's own id for personal, the program id for team. */
  readonly id: string;
}

/** Sign-in and RLS visibility passed. Enough to read; never enough to write. */
export interface MatchVisibilityAccess {
  readonly actor: MatchVideoActor;
  readonly match: VisibleMatchRow;
}

declare const AUTHORIZED_MUTATION: unique symbol;

/**
 * Every mutation check passed. Constructed only by
 * {@link authorizeMatchVideoMutation} — the brand is a symbol this module
 * declares and never exports, so no other file can produce a value of this
 * type, and every RPC wrapper that takes one is taking a decision this
 * module made.
 */
export interface MatchVideoMutationAccess extends MatchVisibilityAccess {
  readonly workspace: MatchVideoWorkspaceScope;
  readonly [AUTHORIZED_MUTATION]: true;
}

declare const AUTHORIZED_REMOVAL: unique symbol;

/** The program roles that may remove any video on their program's matches. */
export const MATCH_VIDEO_REMOVAL_LEAD_ROLES: readonly string[] = Object.freeze([
  "owner",
  "coach",
]);

/**
 * Visibility and the removal rule passed, for ONE attachment. Constructed
 * only by {@link authorizeMatchVideoRemoval}, branded like
 * {@link MatchVideoMutationAccess} and for the same reason — and a distinct
 * brand, so a removal decision can never be passed where a creator's
 * mutation access is required, nor the other way round.
 */
export interface MatchVideoRemovalAccess extends MatchVisibilityAccess {
  readonly attachmentId: string;
  /** Which half of the rule let the caller through. For logs only. */
  readonly basis: "uploader" | "program_lead";
  readonly [AUTHORIZED_REMOVAL]: true;
}

/* -------------------------------------------------------------------------
 * Checks
 * ---------------------------------------------------------------------- */

const LOG = "[match-video-access]";

/**
 * Sign-in, then visibility.
 *
 * A malformed id is refused before any read: it cannot name a row, and a
 * non-UUID against a uuid column is a database error, not a lookup. Absent
 * and invisible are the same 404, because telling a stranger that an id
 * exists is itself a disclosure. A failed read is a 503, not a 404 — the row
 * may well be there, and "not available" would send the person away instead
 * of asking them to retry.
 */
export async function authorizeMatchVisibility(
  matchId: string,
  deps: MatchVideoAccessDeps,
): Promise<MatchVideoResult<MatchVisibilityAccess>> {
  const userId = await deps.currentUserId();
  if (!userId) return fail("unauthenticated", "no_session");

  if (!isUuid(matchId)) return fail("match_not_found", "malformed_match_id");

  const { match, error } = await deps.loadVisibleMatch(matchId);
  if (error) {
    console.error(`${LOG} could not read match`, { matchId, error });
    return fail("storage_unavailable", "match_read_failed");
  }
  if (!match) return fail("match_not_found", "not_visible");

  return ok({ actor: { id: userId }, match });
}

/**
 * Everything {@link authorizeMatchVisibility} asks, then creator, provenance
 * and the exact active workspace — the same three rules, in the same order,
 * that `match_video_authorize_match` rechecks inside the transaction.
 *
 * Visibility comes first so a non-creator who cannot see the match gets the
 * same 404 as anyone else; only someone who CAN see it learns it is not theirs
 * to change (403). Provenance is `forbidden` rather than a code of its own:
 * the user-facing sentence is about who may change the video, and a video
 * cannot be attached to a vendor-analysed match by anyone, creator included.
 */
export async function authorizeMatchVideoMutation(
  matchId: string,
  deps: MatchVideoAccessDeps,
): Promise<MatchVideoResult<MatchVideoMutationAccess>> {
  const visible = await authorizeMatchVisibility(matchId, deps);
  if (!visible.ok) return visible;
  const { actor, match } = visible.value;

  if (!match.created_by || match.created_by !== actor.id) {
    return fail("forbidden", "not_creator");
  }
  if (match.source_provider !== "swing-vision") {
    return fail("forbidden", "not_swingvision");
  }

  const active = await deps.activeWorkspace();
  if (!active) return fail("workspace_mismatch", "no_active_workspace");

  if (match.program_id === null) {
    if (active.kind !== "personal") {
      return fail("workspace_mismatch", "team_match_in_personal_workspace");
    }
    if (active.id !== actor.id) {
      return fail("workspace_mismatch", "personal_workspace_not_actor");
    }
  } else {
    if (active.kind !== "team") {
      return fail("workspace_mismatch", "personal_match_in_team_workspace");
    }
    if (active.id !== match.program_id) {
      return fail("workspace_mismatch", "match_in_other_program");
    }
  }

  const access = {
    actor,
    match,
    workspace: { kind: active.kind, id: active.id },
  } as MatchVideoMutationAccess;
  return ok(access);
}

/**
 * Everything {@link authorizeMatchVisibility} asks, then who may remove THIS
 * attachment: its uploader, or an owner or coach of the match's program.
 *
 * Deliberately NOT {@link authorizeMatchVideoMutation}: removal is the one
 * write a non-creator may make (a coach taking down a player's upload), and
 * it is not workspace-exact — the role is read against the match's own
 * program, whichever workspace the switcher shows. Provenance is not asked
 * either: only a SwingVision match can have an active attachment at all.
 *
 * Visibility first, so a coach of another program or a stranger gets the same
 * 404 as for a match that does not exist. An attachment id that is not filed
 * under this match is a 404 too. Only a caller who can see the match learns
 * that this video is not theirs to remove (403). A staff member or player is
 * refused for any row they did not upload; a personal match has no program,
 * so only its uploader passes. `match_video_remove_attachment` rechecks the
 * same rule under the row locks — this is the gate that keeps a refused
 * request from reaching it.
 */
export async function authorizeMatchVideoRemoval(
  matchId: string,
  attachmentId: string,
  deps: MatchVideoRemovalAccessDeps,
): Promise<MatchVideoResult<MatchVideoRemovalAccess>> {
  const visible = await authorizeMatchVisibility(matchId, deps);
  if (!visible.ok) return visible;
  const { actor, match } = visible.value;

  if (!isUuid(attachmentId)) {
    return fail("match_not_found", "malformed_attachment_id");
  }
  const id = attachmentId.toLowerCase();

  const loaded = await deps.loadAttachmentUploader(match.id, id);
  if (loaded.error) {
    console.error(`${LOG} could not read attachment`, {
      matchId,
      attachmentId: id,
      error: loaded.error,
    });
    return fail("storage_unavailable", "attachment_read_failed");
  }
  if (!loaded.attachment) return fail("match_not_found", "no_such_attachment");

  let basis: MatchVideoRemovalAccess["basis"] | null = null;
  if (loaded.attachment.uploaded_by === actor.id) {
    basis = "uploader";
  } else if (match.program_id !== null) {
    const membership = await deps.loadProgramRole(match.program_id, actor.id);
    if (membership.error) {
      console.error(`${LOG} could not read program role`, {
        matchId,
        error: membership.error,
      });
      return fail("storage_unavailable", "role_read_failed");
    }
    if (
      membership.role !== null &&
      MATCH_VIDEO_REMOVAL_LEAD_ROLES.includes(membership.role)
    ) {
      basis = "program_lead";
    }
  }
  if (!basis) return fail("forbidden", "not_uploader_or_program_lead");

  const access = {
    actor,
    match,
    attachmentId: id,
    basis,
  } as MatchVideoRemovalAccess;
  return ok(access);
}

/* -------------------------------------------------------------------------
 * Production wiring
 * ---------------------------------------------------------------------- */

/**
 * The real seams: the cookie session client for sign-in and the RLS read,
 * and `getWorkspaceContext` for the active workspace. Takes the client and
 * the context function as arguments rather than importing `next/headers`
 * itself, so this module stays importable from a spec.
 *
 * `matches` is read with the caller's client on purpose. Its select policy
 * ("created or played in", plus program members) is the visibility rule; the
 * service role would see every row and turn a 404 into a 403 for strangers.
 */
export function matchVideoAccessDeps(input: {
  supabase: SupabaseClient;
  workspaceContext: () => Promise<{ active: Workspace } | null>;
}): MatchVideoAccessDeps {
  return {
    async currentUserId() {
      const {
        data: { user },
        error,
      } = await input.supabase.auth.getUser();
      return error || !user ? null : user.id;
    },

    async loadVisibleMatch(matchId) {
      const { data, error } = await input.supabase
        .from("matches")
        .select("id, created_by, program_id, source_provider")
        .eq("id", matchId)
        .maybeSingle();
      return {
        match: (data as VisibleMatchRow | null) ?? null,
        error: error?.message ?? null,
      };
    },

    async activeWorkspace() {
      return (await input.workspaceContext())?.active ?? null;
    },
  };
}

/**
 * {@link matchVideoAccessDeps} plus removal's two reads. The attachment is
 * read through the service-role client — the table has no client-role access
 * — but only after visibility has passed on the caller's own client, and
 * only by `id AND match_id`, so it can never answer for a match the caller
 * cannot see. The role is read through the caller's client, whose
 * `program_members` policy always shows them their own row.
 */
export function matchVideoRemovalAccessDeps(input: {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  workspaceContext: () => Promise<{ active: Workspace } | null>;
}): MatchVideoRemovalAccessDeps {
  const base = matchVideoAccessDeps(input);
  return {
    ...base,

    async loadAttachmentUploader(matchId, attachmentId) {
      const { data, error } = await input.admin
        .from("match_video_attachments")
        .select("uploaded_by")
        .eq("id", attachmentId)
        .eq("match_id", matchId)
        .maybeSingle();
      return {
        attachment:
          (data as { uploaded_by: string | null } | null | undefined) ?? null,
        error: error?.message ?? null,
      };
    },

    async loadProgramRole(programId, userId) {
      const { data, error } = await input.supabase
        .from("program_members")
        .select("role")
        .eq("program_id", programId)
        .eq("user_id", userId)
        .maybeSingle();
      return {
        role: (data as { role: string } | null)?.role ?? null,
        error: error?.message ?? null,
      };
    },
  };
}
