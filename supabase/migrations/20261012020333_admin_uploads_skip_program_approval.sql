-- Admin uploads no longer wait on a program's approval.
--
-- Approval gates what a program's own members may do. The admin console
-- uploads on a team's behalf, so an `unclaimed` or `claim_pending` program is
-- uploadable there; `suspended` stays the one stop. The TypeScript half of the
-- same rule is `adminCanUploadFor()` in src/lib/admin/uploads/approval.ts.
--
-- Eight functions carry the check and nothing else about them changes, so each
-- is patched in place from its live definition rather than restated: the
-- bodies run to hundreds of lines and this folder is not a complete record of
-- them. `create or replace` keeps every grant. Each patch must match exactly
-- once or the whole migration fails.
do $$
declare
  patch record;
  def text;
begin
  for patch in
    select * from (values
      ('public.admin_prepare_dual_results(uuid,uuid,uuid,jsonb)',
       $o$status in ('active','claim_pending') for share$o$, $n$status<>'suspended' for share$n$),
      ('public.admin_apply_dual_result(uuid,uuid,uuid)',
       $o$status in ('active','claim_pending') for share$o$, $n$status<>'suspended' for share$n$),
      ('public.admin_prepare_tournament_result(uuid,uuid,uuid,jsonb)',
       $o$status in ('active','claim_pending') for share$o$, $n$status<>'suspended' for share$n$),
      ('public.admin_apply_tournament_result(uuid,uuid,uuid)',
       $o$status in ('active','claim_pending') for share$o$, $n$status<>'suspended' for share$n$),
      ('public.admin_submit_match_file(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
       $o$if program_status not in ('active','claim_pending') then$o$, $n$if program_status='suspended' then$n$),
      ('public.admin_submit_match_video(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
       $o$status='active' for share$o$, $n$status<>'suspended' for share$n$),
      ('public.admin_video_access(uuid,uuid,uuid,text,text)',
       $o$status='active' for share$o$, $n$status<>'suspended' for share$n$),
      ('admin_uploads_private.attachment_snapshot(uuid,uuid)',
       $o$if program.status is distinct from 'active' then$o$, $n$if program.status = 'suspended' then$n$)
    ) as t(fn, old, new)
  loop
    def := pg_get_functiondef(patch.fn::regprocedure);
    if (length(def) - length(replace(def, patch.old, ''))) / length(patch.old) <> 1 then
      raise exception 'admin upload approval patch did not match exactly once in %', patch.fn;
    end if;
    execute replace(def, patch.old, patch.new);
  end loop;
end $$;
