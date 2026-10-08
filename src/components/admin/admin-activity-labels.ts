/**
 * One sentence per `program_audit_log.action` value, for the Activity log
 * card (T19).
 *
 * The 32 values (as of 2026-10-07) are `program_audit_log_action_check`'s own
 * constraint list, read live from the database via `pg_get_constraintdef`
 * rather than `supabase/migrations/`, which runs roughly 100 migrations
 * behind. No label map for this table existed anywhere else in `src` — this
 * is the first one, not a rewording of an existing one.
 *
 * Every label is a past-tense sentence fragment naming what happened, never
 * "splitstep": the video pipeline is "Advantage Intelligence" in every
 * user-visible string. `console.result_added` and `console.analysis_attached`
 * are NOT that pipeline, though the name suggests it — their only writer
 * (migration `20260919044542_persist_admin_upload_submissions.sql`, commit
 * `5a8d47d6`) inserts them from the admin console's own upload flow
 * (`details.origin: 'admin_console'`), for an admin entering a match result
 * or attaching an analysis file by hand from that console.
 * `console.submission_reconciled` is the same console: an admin abandoning or
 * completing a stuck item of a dual/tournament submission
 * (`admin_reconcile_submission_item`, `admin_abandon_result_items`).
 * `match.detached` and `match.round_changed` come from
 * `detach_match_from_event_line` and `set_match_round_on_line` (2026-09-29).
 * `pilot.eligibility_changed` is written only by `admin_set_pilot_eligible`
 * (`20261007142230_program_pilot_eligible.sql`; `details.from/to` booleans,
 * `by_admin`, `stamped`) — the admin granting or revoking a non-college team's
 * program pool, hence "Team pool changed".
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
  "match.detached": "Match detached from its event",
  "match.round_changed": "Match round changed",
  "program.conference_changed": "Conference changed",
  "program.details_changed": "Program details changed",
  "program.crest_changed": "Crest changed",
  "console.result_added": "Result entered from the admin console",
  "console.analysis_attached": "Analysis attached from the admin console",
  "console.submission_reconciled":
    "Submission reconciled from the admin console",
  "join_request.approved": "Join request approved",
  "join_request.declined": "Join request declined",
  "pilot.end_changed": "Pilot end date changed",
  "pilot.ended": "Pilot ended",
  "pilot.eligibility_changed": "Team pool changed",
};

/** The label for `action`, or the raw value when nothing maps it yet. */
export function activityLabel(action: string): string {
  return ADMIN_ACTIVITY_LABELS[action] ?? action;
}
