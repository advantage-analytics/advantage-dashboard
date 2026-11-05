/**
 * Admin › Labels' "Assign": which labeller a session belongs to
 * (`label_sessions.assigned_to`, `assigned_at`), and the list of labellers
 * the menu offers (`users where is_labeller`).
 *
 * Admin-only, both of them — `requireAdmin`, never `requireLabelActor`: a
 * labeller does not pick their own work, and `listLabellers` reads other
 * users' names and emails. Every read and write is service-role: the
 * `users.is_labeller` column has no client grant (20261103204519), and the
 * label tables are written behind the app guard only.
 *
 * Assigning is refused on a `complete` session (it is frozen for everyone;
 * reopen it first), for a user who does not exist, and for one whose
 * `is_labeller` is false. Unassigning (`userId` null) clears both columns.
 * `labelling` and `submitted` sessions may both be reassigned: a submitted
 * session waiting on review still names who did it. The write is matched on
 * `status <> 'complete'`, so a session published between the read and the
 * write is not reassigned behind the admin's back.
 */

import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { ADMIN_REQUIRED, racedMessage } from "./edit-session";
import { normaliseId, type LabelOpResult } from "./operations-session";

const LOG = "[labels:assign]";

export interface AssignDependencies {
  requireAdmin: () => Promise<{ id: string } | null>;
  createAdminClient: () => AdminClient;
  now?: () => number;
}

const defaults: AssignDependencies = { requireAdmin, createAdminClient };

/** A labeller as the Assign menu lists them. */
export interface Labeller {
  id: string;
  name: string;
  email: string;
}

export type LabelAssignResult = LabelOpResult<{
  /** Null after an unassign. */
  assignedTo: { id: string; name: string } | null;
  assignedAt: string | null;
}>;

export type ListLabellersResult =
  { ok: true; labellers: Labeller[] } | { error: string };

export const NOT_A_LABELLER = "That person is not a labeller.";
export const NO_SUCH_USER = "No such user.";
export const ASSIGN_FROZEN =
  "This session is complete. Reopen it before assigning it.";

/** "First Last", else the email's local part, else a placeholder. */
export function labellerName(
  first: string | null | undefined,
  last: string | null | undefined,
  email: string | null | undefined,
): string {
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  const local = email?.split("@")[0]?.trim();
  return local || "Unnamed user";
}

interface DbUser {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  is_labeller: boolean | null;
}

/**
 * Assign session `sessionId` to labeller `userId`, or unassign it with null.
 * Never throws.
 */
export async function assignLabelSession(
  sessionId: unknown,
  userId: unknown,
  deps: AssignDependencies = defaults,
): Promise<LabelAssignResult> {
  const admin = await deps.requireAdmin();
  if (!admin) return { error: ADMIN_REQUIRED };

  const id = normaliseId(sessionId);
  if (!id) return { error: "Invalid session id." };
  const target = userId === null ? null : normaliseId(userId);
  if (userId !== null && !target) return { error: "Invalid user id." };

  try {
    const db = deps.createAdminClient();

    const { data: session, error: sessionError } = await db
      .from("label_sessions")
      .select("status")
      .eq("id", id)
      .maybeSingle<{ status: string }>();
    if (sessionError) {
      return { error: `Could not read the session: ${sessionError.message}` };
    }
    if (!session) return { error: "Session not found." };
    if (session.status === "complete") return { error: ASSIGN_FROZEN };

    let assignee: { id: string; name: string } | null = null;
    if (target) {
      const { data: user, error: userError } = await db
        .from("users")
        .select("id, email, first_name, last_name, is_labeller")
        .eq("id", target)
        .maybeSingle<DbUser>();
      if (userError) {
        return { error: `Could not read the user: ${userError.message}` };
      }
      if (!user) return { error: NO_SUCH_USER };
      if (user.is_labeller !== true) return { error: NOT_A_LABELLER };
      assignee = {
        id: user.id,
        name: labellerName(user.first_name, user.last_name, user.email),
      };
    }

    const assignedAt = target
      ? new Date((deps.now ?? Date.now)()).toISOString()
      : null;
    const { data: moved, error: updateError } = await db
      .from("label_sessions")
      .update({ assigned_to: target, assigned_at: assignedAt })
      .eq("id", id)
      .neq("status", "complete")
      .select("id");
    if (updateError) {
      return { error: `Could not assign the session: ${updateError.message}` };
    }
    if (!moved || moved.length === 0) return { error: racedMessage("session") };

    return { ok: true, assignedTo: assignee, assignedAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} assign threw`, { message });
    return { error: `Could not assign the session: ${message}` };
  }
}

/** Every user with `is_labeller`, by name. Admin-only. Never throws. */
export async function listLabellers(
  deps: AssignDependencies = defaults,
): Promise<ListLabellersResult> {
  const admin = await deps.requireAdmin();
  if (!admin) return { error: ADMIN_REQUIRED };
  try {
    const { data, error } = await deps
      .createAdminClient()
      .from("users")
      .select("id, email, first_name, last_name")
      .eq("is_labeller", true)
      .returns<Omit<DbUser, "is_labeller">[]>();
    if (error) return { error: `Could not list labellers: ${error.message}` };
    const labellers = (data ?? [])
      .map((user) => ({
        id: user.id,
        name: labellerName(user.first_name, user.last_name, user.email),
        email: user.email ?? "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, labellers };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} list threw`, { message });
    return { error: `Could not list labellers: ${message}` };
  }
}
