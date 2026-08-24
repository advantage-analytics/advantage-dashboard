-- Let a program's players upload, unless the program says otherwise.
--
-- `programs.players_can_upload` shipped in 20260818040338 as
-- `not null default false`, with the note "the friendlier default is the wrong
-- one". Team settings has offered it as "anyone" vs "coaches" ever since —
-- while nothing read the answer: `/dashboard/team/upload` gated on staff
-- alone, so the toggle was a label. The page now enforces it
-- (`canUploadForProgram` in `src/lib/workspace/types.ts`), which makes the
-- stored default the thing that decides what a program gets on day one.
--
-- == Why this rewrites rows, and not just the DEFAULT =======================
--
-- Changing the DEFAULT alone would reach only programs created from here on,
-- and essentially none are: `public.programs` is a pre-seeded school
-- directory. Of 1,941 rows, 1,940 read false and 1 reads true. So the UPDATE
-- is the load-bearing half — without it the new default is invisible, because
-- every program anyone will ever claim already exists as a directory row.
--
-- Of the ~1,940 rows this rewrites, exactly two programs have any
-- `program_members` at all; the other ~1,939 are unclaimed directory rows
-- whose flag no human has ever read. So the visible effect is one program.
--
-- == What this deliberately gives up =======================================
--
-- The column cannot tell a stored `false` from a never-set one — that is what
-- `not null default false` costs — so this DOES flip any program that turned
-- the setting off on purpose. Accepted knowingly: the only program with
-- members reading false is the internal test program, and a program that
-- wants coaches-only can set it back from Team settings in one click. The
-- alternative (a nullable tri-state column) is a schema change and a code
-- change to distinguish two states that no live row is actually in.
--
-- Nothing about authorization moves here. Filing a match under a program
-- still requires membership at the database
-- (`matches_block_client_regraft`), and attaching one to a scheduled line
-- still requires staff.

alter table public.programs
  alter column players_can_upload set default true;

update public.programs
   set players_can_upload = true
 where players_can_upload = false;

comment on column public.programs.players_can_upload is
  'Program-wide policy, on by default: may players upload, or only staff? '
  'Read by canUploadForProgram() to gate /dashboard/team/upload. A member '
  'still needs program_members.upload_enabled.';
