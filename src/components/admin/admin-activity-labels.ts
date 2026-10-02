/**
 * One sentence per `program_audit_log.action` value, for the Activity log
 * card (T19).
 *
 * The 28 values are `program_audit_log_action_check`'s own constraint list,
 * read live from the database via `pg_get_constraintdef` rather than
 * `supabase/migrations/`, which runs roughly 100 migrations behind. No label
 * map for this table existed anywhere else in `src` — this is the first one,
 * not a rewording of an existing one.
 *
 * Every label is a past-tense sentence fragment naming what happened, never
 * "splitstep": the video pipeline is "Advantage Intelligence" in every
 * user-visible string. `console.result_added` and `console.analysis_attached`
 * are NOT that pipeline, though the name suggests it — their only writer
 * (migration `20260919044542_persist_admin_upload_submissions.sql`, commit
 * `5a8d47d6`) inserts them from the admin console's own upload flow
 * (`details.origin: 'admin_console'`), for an admin entering a match result
 * or attaching an analysis file by hand from that console.
 *
 * `activityLabel()` never throws and never hides a row: an action this map
 * has not learned about yet falls back to printing the raw string, because an
 * audit log that drops an entry it cannot name is worse than one with an
 * unpolished line in it.
 */
export const ADMIN_ACTIVITY_LABELS: Record<string, string> = {
  "player.added": "Player added",
  "player.updated": "Player updated",
  "player.archived": "Player archived",
  "player.restored": "Player restored",
  "player.claimed": "Player claimed",
  "player.merged": "Players merged",
  "invite.created": "Invitation sent",
  "invite.revoked": "Invitation revoked",
  "invite.accepted": "Invitation accepted",
  "member.removed": "Member removed",
  "member.role_changed": "Member role changed",
  "member.account_deleted": "Member account deleted",
  "member.left": "Member left",
  "member.upload_changed": "Member upload access changed",
  "seats.changed": "Seat count changed",
  "lineup.set": "Lineup set",
  "ownership.transferred": "Ownership transferred",
  "event.deleted": "Event deleted",
  "match.attached": "Match attached",
  "program.conference_changed": "Conference changed",
  "program.details_changed": "Program details changed",
  "program.crest_changed": "Crest changed",
  "console.result_added": "Result entered from the admin console",
  "console.analysis_attached": "Analysis attached from the admin console",
  "join_request.approved": "Join request approved",
  "join_request.declined": "Join request declined",
  "pilot.end_changed": "Pilot end date changed",
  "pilot.ended": "Pilot ended",
};

/** The label for `action`, or the raw value when nothing maps it yet. */
export function activityLabel(action: string): string {
  return ADMIN_ACTIVITY_LABELS[action] ?? action;
}
