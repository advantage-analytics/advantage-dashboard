-- Pin and rename Ask conversations.
--
-- The rail lists a player's earlier questions by month, newest first. Two
-- things it could not do: keep a question at the top (a coach's standing
-- "how is the serve holding up" sinks under every new one), and call a
-- question something shorter than the question itself (ask_save_exchange()
-- takes the title from the question's text, the whole sentence). This adds
-- the pin and lets the owner change the title.
--
--   - pinned_at: when the owner pinned it; null for the rest. The rail lists
--     pinned conversations first, newest pin first, then the months.
--   - An UPDATE policy, owner-only and -- for a team conversation -- only
--     while the owner is still a member of the program, the same clause the
--     SELECT policy carries. authenticated may update title and pinned_at and
--     no other column: user_id, program_id, created_at and updated_at stay
--     the database's. updated_at is the last exchange, so a rename or a pin
--     does not move a question up the months.
--
-- Applied to the live database on 2026-10-15 as version 20261015094801
-- (`ask_conversation_pins_rename`). VERIFIED: see the end of this file.

alter table public.ask_conversations
  add column if not exists pinned_at timestamptz;

comment on column public.ask_conversations.pinned_at is
  'When the owner pinned this conversation to the top of their list; null when it is not pinned.';

create index if not exists ask_conversations_user_pinned_idx
  on public.ask_conversations (user_id, pinned_at desc)
  where pinned_at is not null;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'ask_conversations'
       and policyname = 'ask_conversations_update'
  ) then
    create policy ask_conversations_update on public.ask_conversations
      for update to authenticated
      using (
        user_id = (select auth.uid())
        and (program_id is null or public.user_program_role(program_id) is not null)
      )
      with check (
        user_id = (select auth.uid())
        and (program_id is null or public.user_program_role(program_id) is not null)
      );
  end if;
end $$;

grant update (title, pinned_at) on public.ask_conversations to authenticated;

-- VERIFIED on the live database, 2026-10-15, after the migration ran:
-- ask_conversations carries pinned_at and the partial index; the policies are
-- ask_conversations_select and ask_conversations_update (both to
-- authenticated, the update's USING and WITH CHECK both owner + membership);
-- authenticated's UPDATE grant covers exactly title and pinned_at. In a
-- rolled-back transaction as a conversation's owner, `update ... set title,
-- pinned_at` touched 1 row; as another signed-in user the same update
-- touched 0 rows.
