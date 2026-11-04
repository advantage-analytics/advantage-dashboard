/**
 * One minute of labelling, recorded (`label_work_beats`, service-role only).
 * The console's heartbeat (use-work-beat.ts) calls this at most once a minute
 * while someone is working; the Labels list counts the rows as minutes worked.
 *
 * Gated as every label write is: an admin, or the labeller the session is
 * assigned to while it is `labelling` (`requireLabelActor`). A submitted
 * session refuses a labeller's beats — they have stopped working it.
 *
 * The minute is the server's (the current UTC minute), never the caller's.
 * The primary key is (session, user, minute), so a second beat in the same
 * minute — a second tab, a tick on the boundary — is ignored by the database
 * (`ON CONFLICT DO NOTHING`), and a 23505 that slips through is the same
 * answer. A cache of effort, not a step to undo: never journaled, never
 * throws.
 */

import { isUuid } from "@/lib/admin/validation";
import {
  requireLabelActor,
  type LabelActor,
} from "@/lib/services/programs/admin-guard";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { ACTOR_REQUIRED } from "./edit-session";
import { beatMinute } from "./work-beats";

const LOG = "[labels:work-beat]";

export type LabelWorkBeatResult = { ok: true } | { error: string };

export interface WorkBeatDependencies {
  requireLabelActor: (sessionId: string) => Promise<LabelActor | null>;
  createAdminClient: () => AdminClient;
  now: () => number;
}

const defaults: WorkBeatDependencies = {
  requireLabelActor: (sessionId) => requireLabelActor(sessionId),
  createAdminClient,
  now: Date.now,
};

export const WORK_BEAT_CONFLICT = "session_id,user_id,minute";

export async function recordLabelWorkBeat(
  sessionId: unknown,
  deps: WorkBeatDependencies = defaults,
): Promise<LabelWorkBeatResult> {
  try {
    const id = typeof sessionId === "string" ? sessionId : "";
    const actor = await deps.requireLabelActor(id);
    if (!actor) return { error: ACTOR_REQUIRED };
    if (!isUuid(id)) return { error: "No such session." };

    const { error } = await deps
      .createAdminClient()
      .from("label_work_beats")
      .upsert(
        { session_id: id, user_id: actor.id, minute: beatMinute(deps.now()) },
        { onConflict: WORK_BEAT_CONFLICT, ignoreDuplicates: true },
      );
    if (error && error.code !== "23505") {
      console.error(`${LOG} not saved`, {
        sessionId: id,
        message: error.message,
      });
      return { error: "Could not record the minute." };
    }
    return { ok: true };
  } catch (err) {
    console.error(`${LOG} threw`, {
      message: err instanceof Error ? err.message : String(err),
    });
    return { error: "Could not record the minute." };
  }
}
