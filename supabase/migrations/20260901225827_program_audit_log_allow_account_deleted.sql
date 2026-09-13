-- release_my_account_from_programs() audits with action 'member.account_deleted',
-- which the original program_audit_log_action_check whitelist did not include.
do $$
begin
  if exists (select 1 from pg_constraint
              where conname = 'program_audit_log_action_check'
                and conrelid = 'public.program_audit_log'::regclass) then
    alter table public.program_audit_log drop constraint program_audit_log_action_check;
  end if;
  alter table public.program_audit_log
    add constraint program_audit_log_action_check
    check (action = any (array[
      'player.added','player.updated','player.archived','player.claimed','player.merged',
      'invite.created','invite.revoked','invite.accepted',
      'member.removed','seats.changed','member.account_deleted'
    ]));
end $$;
