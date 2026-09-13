-- `set_program_lineup` writes one audit row per save, and the action check did
-- not know the verb, so every save raised 23514 and the Roster page reported
-- the constraint text to the coach.
--
-- The list is an allowlist on purpose — it is what stops a caller inventing an
-- action name and making the log unreadable — so the verb is added to it
-- rather than the constraint being dropped.
--
-- `lineup.set` and not `player.updated`: a reshuffle is one act on the squad's
-- order, and logging it as N player edits would bury who moved where under
-- rows that look like somebody renamed a freshman.
alter table public.program_audit_log
  drop constraint program_audit_log_action_check;

alter table public.program_audit_log
  add constraint program_audit_log_action_check check (
    action = any (array[
      'player.added',
      'player.updated',
      'player.archived',
      'player.claimed',
      'player.merged',
      'invite.created',
      'invite.revoked',
      'invite.accepted',
      'member.removed',
      'seats.changed',
      'member.account_deleted',
      'lineup.set'
    ])
  );
