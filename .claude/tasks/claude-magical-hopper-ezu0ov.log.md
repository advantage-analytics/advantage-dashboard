# Run log — claude/magical-hopper-ezu0ov

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Bring the roster widget to Design 9a (v3 chrome) — done
- **gate:** mechanical — `npm run lint` exit 0 (0 errors, 38 pre-existing
  `react-hooks/*` warnings in untouched files), `npx tsc --noEmit` exit 0 with no
  output, `npm test` 93 passed. No stale `.next/` type errors, so no clear-and-rerun
  was needed. Completion review — `VERDICT: pass`, all five criteria met, no files
  touched outside `files:`. Guardrails — `pipeline-guardrails-reviewer` ran
  (`src/app/dashboard/` and `src/components/dashboard/` both in the diff) and
  returned no findings; `rls-boundary-reviewer` was skipped because the diff
  contains no `src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or
  `supabase/migrations/` path, no new table, view or query, and
  `git ls-files --others --exclude-standard` was empty so no untracked file could
  hide one.
- **changed:** `roster-table.tsx` and `roster/page.tsx` only. Added a 24px leading
  lineup `#` column (`COL.spot` + a display-only `LineupSpot` reading the existing
  `RosterMember.lineupSpot`, em dash in `--ink-400` for a null spot and for every
  invite row) with an `eyebrow-sm` `#` header plus a 10px `ArrowUp` labelling the
  sort `getRosterData` already returns. Member rows moved from full-bleed bordered
  rows to 8a's rounded inset hover (`ROW_INSET = -mx-4 rounded-[var(--radius-element)]
  px-4 py-3`, `hover:bg-[var(--surface-muted)]`), horizontal padding moved from the
  row to the card (`px-6 pt-0.5 pb-1.5`), and the comment that argued the opposite
  was rewritten rather than left contradicting the code. Invite rows keep their place
  in the same list; "Withdraw" is now "Revoke". Page header switched to
  `eyebrow` / `text-display` / `text-body-sm` with `lg:items-end` so the existing
  `RosterHeaderButtons` pair bottom-aligns with the heading block — that file needed
  no change, its `advButton("outline")`/`advButton("primary")` at `md` already being
  9a's 36px secondary/primary. Three implementer judgment calls were reviewed and
  accepted: all header cells moved to `eyebrow-sm` (9a marks them all that way),
  scroll body `min-w` 840px → 880px to pay for the new column, and Revoke's hover
  recoloured `--danger` → `--ink-900` per 9a's literal markup — the last drops a
  destructive-affordance tint and is flagged as a UX note, not a criterion breach.
  The deferred database work held: the invite line still reads
  "Invited {date} as {role}", with no "by you".

## T2 · Align the roster dialogs with 9b and 9c — done
- **gate:** mechanical — `npm run lint` exit 0 (0 errors, 38 pre-existing warnings,
  none in the touched files), `npx tsc --noEmit` exit 0 with no output, `npm test`
  93 passed; no stale `.next/` types, so no clear-and-rerun. Completion review —
  `VERDICT: pass`, all five criteria met, nothing outside `files:`. It independently
  verified the four claims it was asked to check rather than taking them on trust:
  the token really is unrecoverable, `useWorkspace()`/`WorkspaceProvider` really
  exist and are mounted by `dashboard/layout.tsx`, `linked` did not become dead, and
  nothing was removed. Guardrails — `pipeline-guardrails-reviewer` ran
  (`src/components/dashboard/` in the diff) and returned no findings, confirming the
  new `useWorkspace()` read is display-only and cannot make the dialog write to a
  different program than the one it names; `rls-boundary-reviewer` was skipped
  because the diff is two client components with no `src/lib/supabase/`,
  `src/lib/data/`, `src/app/api/` or `supabase/migrations/` path, no new query, and
  no server-action signature change, with `git ls-files --others --exclude-standard`
  empty so nothing untracked could hide one.
- **changed:** `roster-invite-dialog.tsx` and `add-player-dialog.tsx` only. The
  invite dialog's title now interpolates the active program's name from the
  `useWorkspace()` context the dashboard layout already mounts — no new query — and
  its description ternary collapsed to 9b's single line, with `linked` still
  consumed by the picker, email-match, role and info-row branches. The add-player
  description is now 9c's line; its info-row wording was deliberately left alone.
  Both dialogs keep every field and control, the Player / Assistant coach role
  picker included.
  **Copy invite link shipped disabled, on purpose.** The criterion allowed that only
  if a token genuinely cannot exist before Send, and it cannot: `inviteMember` mints
  the token locally and hands `create_program_invite` only `hashToken(token)`, the
  RPC returns the invite id rather than the token, `InviteResult` carries no token
  field, and the sole place a raw `/join/<token>` URL is ever built is the outbound
  email template. Enabling it would have meant either minting an invitation the
  coach did not ask for or returning the raw token to the browser — a documented
  security regression and outside this task. The control renders disabled with the
  reason in a code comment plus `title` and `sr-only` text; no URL is fabricated.
  One deviation from the mockup, accepted by review: the link icon is 14px per the
  task contract rather than 9b's 12px, matching every other glyph in the dialog.

## T3 · Add 9d's claim receipt above the roster — blocked
- **gate:** mechanical — `npm run lint` exit 0 (0 errors, 38 pre-existing
  warnings), `npx tsc --noEmit` exit 0, `npm test` 93 passed. Completion review —
  **`VERDICT: needs-work`**, which is where this run stopped. Guardrails were not
  reached: the gate runs in cost order and stops at the first failure, so neither
  `pipeline-guardrails-reviewer` nor `rls-boundary-reviewer` ran. Stash:
  `f0b7b10d1ece1ad1010dcc7bdc364adf38214ed8` (`blocked: T3`).
- **changed:** nothing landed. All five `done when:` bullets were judged satisfied
  as literally written, and the two smaller decisions were accepted — "their"
  rather than a pronoun inferred from a name, and naming every same-day claimer
  (the reviewer confirmed "most recent" was genuinely impossible: `claimed_at`
  exists on `DbRosterRow` but is consumed only to compute the `claimedToday`
  boolean and never reaches `RosterMember`, so ordering by claim time would need
  the field the task forbids).
  **What failed is not in the criteria.** The receipt renders ungated, for every
  roster viewer, and prints the program's seat usage. The reviewer established
  that no ungated element on this page shows a player seat or billing figures
  today: `RosterHeaderButtons` is the only other consumer of `roster.seats` and is
  inside `{canManage && …}`, `roster-table.tsx` never references seats, and the
  standing line is already replaced by a generic sentence for non-`canManage`
  viewers. So the diff would newly disclose the program's seat budget to players.
  Criterion 1's wording ("whenever at least one member has `claimedToday`", no role
  qualifier) permits it, which is the defect: the criterion was written without
  considering the player view, and the implementer followed it faithfully. A
  follow-up task needs to decide between gating the whole receipt behind
  `canManage` and dropping the seat clause from the player-visible version — and
  should fix criterion 1's wording so the next attempt is not graded against the
  same blind spot.
  Also noted, not the blocker: with several same-day claimers the single
  `View profile` link can only carry the first-named, and the disambiguating
  `aria-label` is screen-reader-only, so sighted users get no cue which profile it
  opens.
